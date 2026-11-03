import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ensureNoBurnedGraphicsInPrompt } from "@/lib/ai-video-prompt";
import { getLucaGenerationRefUrls } from "@/lib/characters";
import {
  getEvoLinkBillableDurationSec,
  getEvoLinkVideoQuality,
} from "@/lib/evolink-video-config";
import {
  ensureH264Mp4,
  probeVideoDurationSec,
} from "@/lib/ffmpeg-transcode";
import type { RemixSpec, ResolvedRemixSpec } from "@/lib/remix-spec";

const EVOLINK_BASE = "https://api.evolink.ai";
const VIDEO_MODEL = "seedance-2.5-reference-to-video";
const TTS_MODEL = "qwen-audio-3.1-tts-flash";

const POLL_INTERVAL_MS = 8000;
const TASK_TIMEOUT_MS = 20 * 60 * 1000;

export type EvoLinkTaskStatus = "pending" | "processing" | "completed" | "failed";

type TaskResponse = {
  id?: string;
  status?: EvoLinkTaskStatus;
  results?: string[];
  error?: string | { message?: string };
};

function getApiKey(): string {
  const key = (process.env.EVOLINK_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("Missing EVOLINK_API_KEY.");
  }
  return key;
}

function getTtsVoice(): string | undefined {
  const voice = (process.env.EVOLINK_TTS_VOICE ?? "").trim();
  return voice || undefined;
}

function taskErrorMessage(task: TaskResponse): string {
  if (typeof task.error === "string") return task.error;
  if (task.error && typeof task.error === "object" && task.error.message) {
    return task.error.message;
  }
  return "EvoLink task failed.";
}

async function evolinkFetch(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = getApiKey();
  const url = `${EVOLINK_BASE}${pathname}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export type ReferenceVideoSubmitOptions = {
  prompt: string;
  durationSec: number;
  generateAudio?: boolean;
  model?: string;
  /** Use planned duration as-is (4–8s), ignoring EVOLINK_VIDEO_MAX_SEC cap. */
  exactDuration?: boolean;
  /** Extra refs (e.g. set plate from source frame) after Luca @image1–3. */
  additionalImageUrls?: string[];
  /** When set, replaces default Luca @image1–3 (+ additionalImageUrls). */
  imageUrlsOverride?: string[];
};

export async function submitReferenceVideoTaskWithOptions(
  options: ReferenceVideoSubmitOptions,
): Promise<string> {
  const image_urls =
    options.imageUrlsOverride?.length ?
      options.imageUrlsOverride.filter(Boolean)
    : [
        ...getLucaGenerationRefUrls(),
        ...(options.additionalImageUrls ?? []).filter(Boolean),
      ];
  const planned = Math.max(4, Math.min(8, Math.round(options.durationSec)));
  const duration = options.exactDuration
    ? planned
    : getEvoLinkBillableDurationSec(options.durationSec);
  const prompt = ensureNoBurnedGraphicsInPrompt(options.prompt);
  const response = await evolinkFetch("/v1/videos/generations", {
    method: "POST",
    body: JSON.stringify({
      model: options.model ?? VIDEO_MODEL,
      prompt,
      image_urls,
      duration,
      quality: getEvoLinkVideoQuality(),
      aspect_ratio: "9:16",
      generate_audio: options.generateAudio ?? false,
      content_filter: true,
    }),
  });

  const data = (await response.json()) as TaskResponse & { message?: string };
  if (!response.ok) {
    throw new Error(
      data.message?.trim() || `EvoLink video submit failed (${response.status}).`,
    );
  }
  if (!data.id) {
    throw new Error("EvoLink video submit returned no task id.");
  }
  return data.id;
}

export async function submitReferenceVideoTask(
  prompt: string,
  durationSec: number,
): Promise<string> {
  return submitReferenceVideoTaskWithOptions({
    prompt,
    durationSec,
    generateAudio: false,
  });
}

export async function submitTtsTask(text: string): Promise<string> {
  const voice = getTtsVoice();
  const response = await evolinkFetch("/v1/audios/generations", {
    method: "POST",
    body: JSON.stringify({
      model: TTS_MODEL,
      prompt: text,
      ...(voice ? { voice } : {}),
      format: "mp3",
    }),
  });

  const data = (await response.json()) as TaskResponse & { message?: string };
  if (!response.ok) {
    throw new Error(
      data.message?.trim() || `EvoLink TTS submit failed (${response.status}).`,
    );
  }
  if (!data.id) {
    throw new Error("EvoLink TTS submit returned no task id.");
  }
  return data.id;
}

export async function waitForTaskResult(taskId: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < TASK_TIMEOUT_MS) {
    const response = await evolinkFetch(`/v1/tasks/${taskId}`, { method: "GET" });
    const data = (await response.json()) as TaskResponse;
    if (!response.ok) {
      throw new Error(`EvoLink task query failed (${response.status}).`);
    }

    if (data.status === "completed") {
      const url = data.results?.[0];
      if (!url || typeof url !== "string") {
        throw new Error("EvoLink task completed with no result URL.");
      }
      return url;
    }
    if (data.status === "failed") {
      throw new Error(taskErrorMessage(data));
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`EvoLink task timed out: ${taskId}`);
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}

export async function generateRemixAssets(
  spec: RemixSpec,
  assetsDir: string,
): Promise<ResolvedRemixSpec> {
  await mkdir(assetsDir, { recursive: true });

  const videoTaskIds = await Promise.all(
    spec.clips.map((clip, index) =>
      submitReferenceVideoTask(clip.prompt, clip.durationSec).then((id) => ({
        index,
        id,
      })),
    ),
  );

  const voTaskIds =
    spec.audio.length > 0
      ? await Promise.all(spec.audio.map((vo) => submitTtsTask(vo.text)))
      : [];

  const videoUrls = await Promise.all(
    videoTaskIds.map(async ({ index, id }) => {
      const url = await waitForTaskResult(id);
      return { index, url };
    }),
  );

  const voUrls =
    voTaskIds.length > 0
      ? await Promise.all(voTaskIds.map((id) => waitForTaskResult(id)))
      : [];

  const resolvedClips = await Promise.all(
    spec.clips.map(async (clip, index) => {
      const match = videoUrls.find((v) => v.index === index);
      if (!match) throw new Error(`Missing video result for clip ${index}.`);
      const localPath = path.join(assetsDir, `clip-${index}.mp4`);
      await downloadToFile(match.url, localPath);
      await ensureH264Mp4(localPath);
      const sourceDurationSec = await probeVideoDurationSec(localPath);
      return {
        ...clip,
        localPath,
        ...(sourceDurationSec ? { sourceDurationSec } : {}),
      };
    }),
  );

  const resolvedAudio =
    voUrls.length > 0
      ? await Promise.all(
          spec.audio.map(async (vo, index) => {
            const url = voUrls[index];
            if (!url) throw new Error(`Missing TTS result for vo ${index}.`);
            const localPath = path.join(assetsDir, `vo-${index}.mp3`);
            await downloadToFile(url, localPath);
            return { ...vo, localPath };
          }),
        )
      : [];

  return {
    ...spec,
    clips: resolvedClips,
    audio: resolvedAudio,
  };
}

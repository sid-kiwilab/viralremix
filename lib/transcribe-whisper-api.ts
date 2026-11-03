import { readFile } from "node:fs/promises";
import type {
  SegmentTranscript,
  TranscriptSegment,
} from "@/lib/segment-transcribe";
import {
  normalizeTranscriptWords,
  spokenFromWords,
} from "@/lib/segment-transcribe";

type WhisperVerbose = {
  text?: string;
  words?: Array<{ word?: string; start?: number; end?: number }>;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
};

export type WhisperBackend = "groq" | "openai";

function roundMs(sec: number): number {
  return Math.round(sec * 1000) / 1000;
}

function getGroqModel(): string {
  return (
    (process.env.TRANSCRIBE_GROQ_MODEL ?? "").trim() ||
    "whisper-large-v3-turbo"
  );
}

function getOpenAiModel(): string {
  return (
    (process.env.TRANSCRIBE_OPENAI_MODEL ?? "").trim() || "whisper-1"
  );
}

function whisperToTranscript(
  body: WhisperVerbose,
  model: string,
  segmentSec: number,
): SegmentTranscript | null {
  const words = normalizeTranscriptWords(
    (body.words ?? []).map((w) => ({
      word: String(w.word ?? "").trim(),
      startSec: Number(w.start),
      endSec: Number(w.end),
    })),
  ).filter((w) => w.startSec < segmentSec + 0.01);

  const segments: TranscriptSegment[] = (body.segments ?? [])
    .map((s) => ({
      startSec: roundMs(Number(s.start)),
      endSec: roundMs(Math.min(Number(s.end), segmentSec)),
      text: String(s.text ?? "").trim(),
    }))
    .filter((s) => s.text && s.endSec > s.startSec && s.startSec < segmentSec);

  const fullText =
    (body.text ?? "").trim() ||
    (words.length ? spokenFromWords(words, 0, segmentSec + 1) : "") ||
    segments.map((s) => s.text).join(" ").trim();

  if (!fullText) return null;

  return { fullText, segments, words, model };
}

async function transcribeWithWhisperApi(options: {
  mp3Path: string;
  backend: WhisperBackend;
  segmentSec: number;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; transcript: SegmentTranscript }
  | { ok: false; error: string }
> {
  const apiKey =
    options.backend === "groq"
      ? (process.env.GROQ_API_KEY ?? "").trim()
      : (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        options.backend === "groq"
          ? "Missing GROQ_API_KEY."
          : "Missing OPENAI_API_KEY.",
    };
  }

  const url =
    options.backend === "groq"
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";

  const model =
    options.backend === "groq" ? getGroqModel() : getOpenAiModel();

  const audioBytes = await readFile(options.mp3Path);
  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBytes], { type: "audio/mpeg" }),
    "segment.mp3",
  );
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: options.signal ?? AbortSignal.timeout(120_000),
  });

  const body = (await response.json()) as WhisperVerbose & {
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      error:
        body.error?.message?.trim() ||
        `Whisper transcription failed (${response.status}).`,
    };
  }

  const transcript = whisperToTranscript(
    body,
    `${options.backend}:${model}`,
    options.segmentSec,
  );
  if (!transcript) {
    return { ok: false, error: "No speech detected in transcript." };
  }

  return { ok: true, transcript };
}

export function resolveTranscribeBackend():
  | WhisperBackend
  | "openrouter" {
  const env = (process.env.TRANSCRIBE_PROVIDER ?? "").trim().toLowerCase();
  if (env === "openrouter") return "openrouter";
  if (env === "openai") return "openai";
  if (env === "groq") return "groq";
  if ((process.env.GROQ_API_KEY ?? "").trim()) return "groq";
  if ((process.env.OPENAI_API_KEY ?? "").trim()) return "openai";
  return "openrouter";
}

export async function transcribeMp3WithWhisper(
  mp3Path: string,
  segmentSec: number,
  signal?: AbortSignal,
): Promise<
  | { ok: true; transcript: SegmentTranscript }
  | { ok: false; error: string }
> {
  const backend = resolveTranscribeBackend();
  if (backend === "openrouter") {
    return { ok: false, error: "Whisper backend not selected." };
  }
  return transcribeWithWhisperApi({ mp3Path, backend, segmentSec, signal });
}

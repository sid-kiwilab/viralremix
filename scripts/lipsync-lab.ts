/**
 * One-off lip-sync experiment (not the remix ad pipeline).
 * Cheap defaults: 720p, 4s, mini/fast Seedance + generate_audio.
 *
 * Usage:
 *   npm run lipsync-lab -- "Hey everyone, welcome back."
 * Requires public Luca refs (REMIX_LUCA_REF_BASE) or GitHub raw on main.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLucaSpeakingVideoPrompt } from "@/lib/ai-video-prompt";
import { loadLocalEnv } from "@/lib/load-env";
import {
  downloadToFile,
  submitReferenceVideoTaskWithOptions,
  submitTtsTask,
  waitForTaskResult,
} from "@/lib/evolink";
import { ensureH264Mp4 } from "@/lib/ffmpeg-transcode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

loadLocalEnv();

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(process.cwd(), "out", "lipsync-lab");
const DURATION_SEC = 4;

const DEFAULT_PHRASE = "Hey everyone, welcome back to the channel.";

function getLabModel(): string {
  return (
    (process.env.EVOLINK_LIPSYNC_MODEL ?? "").trim() ||
    "seedance-2.0-mini-reference-to-video"
  );
}

function buildSpeakingPrompt(phrase: string): string {
  return buildLucaSpeakingVideoPrompt({
    background: "clean indoor background, soft lighting",
    action: "small hand gestures, slight head nods, friendly energy, stable tripod",
    spoken: phrase,
  });
}

async function muxVideoAudio(videoPath: string, audioPath: string, outPath: string) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
}

async function main() {
  const phrase =
    process.argv.slice(2).join(" ").trim() || DEFAULT_PHRASE;
  const model = getLabModel();

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "phrase.txt"),
    `${phrase}\nmodel=${model}\n`,
    "utf8",
  );

  console.log("Lip-sync lab (cheap experiment)");
  console.log("Phrase:", phrase);
  console.log("Model:", model);
  console.log("Duration:", DURATION_SEC, "s · quality:", process.env.EVOLINK_VIDEO_QUALITY ?? "720p");

  const prompt = buildSpeakingPrompt(phrase);
  console.log("\nSubmitting speaking video (generate_audio=true)…");
  let videoTaskId: string;
  try {
    videoTaskId = await submitReferenceVideoTaskWithOptions({
      prompt,
      durationSec: DURATION_SEC,
      exactDuration: true,
      generateAudio: true,
      model,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Speaking video submit failed:", msg);
    console.log("Retrying with seedance-2.0-fast-reference-to-video…");
    videoTaskId = await submitReferenceVideoTaskWithOptions({
      prompt,
      durationSec: DURATION_SEC,
      exactDuration: true,
      generateAudio: true,
      model: "seedance-2.0-fast-reference-to-video",
    });
  }

  console.log("Submitting TTS fallback track (same phrase)…");
  const ttsTaskId = await submitTtsTask(phrase);

  console.log("Waiting for EvoLink tasks…");
  const [videoUrl, ttsUrl] = await Promise.all([
    waitForTaskResult(videoTaskId),
    waitForTaskResult(ttsTaskId),
  ]);

  const rawVideo = path.join(OUT_DIR, "speaking-raw.mp4");
  const ttsAudio = path.join(OUT_DIR, "phrase.mp3");
  const finalNative = path.join(OUT_DIR, "lipsync-native-audio.mp4");
  const finalMuxed = path.join(OUT_DIR, "lipsync-lab.mp4");

  await downloadToFile(videoUrl, rawVideo);
  await downloadToFile(ttsUrl, ttsAudio);
  await ensureH264Mp4(rawVideo);

  try {
    await execFileAsync("ffmpeg", ["-y", "-i", rawVideo, "-c", "copy", finalNative], {
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", rawVideo, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", finalNative],
      { maxBuffer: 16 * 1024 * 1024 },
    );
  }

  console.log("Muxing TTS over video (fallback sync test)…");
  await muxVideoAudio(rawVideo, ttsAudio, finalMuxed);

  console.log("\nDone.");
  console.log("Native model audio:", finalNative);
  console.log("TTS muxed (listen if native sync is weak):", finalMuxed);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

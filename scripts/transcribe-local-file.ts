/**
 * Transcribe a local video clip (Groq/OpenAI Whisper if keys set, else OpenRouter).
 *
 *   npx tsx scripts/transcribe-local-file.ts path/to/clip.mp4
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "@/lib/load-env";
import { resolveTranscribeBackend } from "@/lib/transcribe-whisper-api";
import { probeVideoDurationSec } from "@/lib/ffmpeg-transcode";
import { transcribeSegmentVideo } from "@/lib/segment-transcribe";

loadLocalEnv();

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath) {
    console.error("Usage: tsx scripts/transcribe-local-file.ts <video-path>");
    process.exit(1);
  }
  const abs = path.resolve(videoPath);
  const durationSec = (await probeVideoDurationSec(abs)) ?? 8;
  const backend = resolveTranscribeBackend();
  console.log(`Extract audio (${durationSec.toFixed(1)}s)…`);
  console.log(
    backend === "openrouter"
      ? "ASR via OpenRouter…"
      : `Whisper via ${backend === "groq" ? "Groq" : "OpenAI"}…`,
  );

  const result = await transcribeSegmentVideo(abs, durationSec);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  const outTxt = abs.replace(/\.[^.]+$/, "") + "-transcript.txt";
  await writeFile(
    outTxt,
    `${result.transcript.fullText}\n`,
    "utf8",
  );
  console.log("\n--- transcript ---\n");
  console.log(result.transcript.fullText);
  console.log("\nModel:", result.transcript.model);
  console.log("Saved:", outTxt);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

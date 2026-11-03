/**
 * One EvoLink lip-sync clip from a reference segment (no Remotion, no stitching).
 *
 *   npx tsx scripts/evolink-from-reference-segment.ts --url "<tiktok>" --sec 8
 *
 * 1. Uses first-{sec}s.mp4 (trims from source.mp4 if missing)
 * 2. ASR on that file only → script for 0..sec
 * 3. Single EvoLink mini job (generate_audio=true)
 */
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildLucaSpeakingVideoPrompt } from "@/lib/ai-video-prompt";
import { loadLocalEnv } from "@/lib/load-env";
import {
  downloadToFile,
  submitReferenceVideoTaskWithOptions,
  waitForTaskResult,
} from "@/lib/evolink";
import { ensureH264Mp4 } from "@/lib/ffmpeg-transcode";
import type { SegmentRemakePlan } from "@/lib/segment-analyze";
import {
  evolinkRefHelpText,
  resolveEvoLinkImageUrls,
} from "@/lib/resolve-evolink-image-urls";
import { extractSetPlateJpg } from "@/lib/segment-set-plate";
import {
  spokenFromWords,
  transcribeSegmentVideo,
} from "@/lib/segment-transcribe";
import { buildVisualContinuityLock } from "@/lib/segment-visual-continuity";

loadLocalEnv();

const execFileAsync = promisify(execFile);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function slugFromUrl(url: string): string {
  const m = url.match(/video\/(\d+)/);
  return m?.[1] ?? "segment";
}

async function trimVideo(input: string, output: string, sec: number) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      input,
      "-t",
      String(sec),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      output,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

async function main() {
  const url = argValue("--url");
  if (!url) {
    throw new Error(
      "Usage: tsx scripts/evolink-from-reference-segment.ts --url <url> [--sec 8]",
    );
  }
  const sec = Math.min(
    8,
    Math.max(4, parseInt(argValue("--sec") ?? "8", 10) || 8),
  );
  const slug = slugFromUrl(url);
  const outDir = path.join(process.cwd(), "out", "recreate", slug);
  const sourceMp4 = path.join(outDir, "source.mp4");
  const segmentMp4 = path.join(outDir, `first-${sec}s.mp4`);
  const planPath = path.join(outDir, `segment-plan-${sec}s.json`);
  const fallbackPlanPath = path.join(outDir, "segment-plan-16s.json");

  await mkdir(outDir, { recursive: true });

  try {
    await access(segmentMp4);
  } catch {
    console.log(`Trim first ${sec}s from source…`);
    await trimVideo(sourceMp4, segmentMp4, sec);
  }

  console.log("Transcribe reference segment (0–", sec, "s)…");
  const tr = await transcribeSegmentVideo(segmentMp4, sec);
  if (!tr.ok) throw new Error(tr.error);

  const script =
    tr.transcript.words.length > 0
      ? spokenFromWords(tr.transcript.words, 0, sec)
      : tr.transcript.fullText.trim();
  if (!script) throw new Error("Empty transcript for segment.");

  const transcriptPath = path.join(outDir, `evolink-reference-${sec}s-transcript.json`);
  await writeFile(
    transcriptPath,
    `${JSON.stringify({ script, ...tr.transcript }, null, 2)}\n`,
    "utf8",
  );
  console.log("Script:", script.slice(0, 140) + (script.length > 140 ? "…" : ""));

  let plan: SegmentRemakePlan;
  try {
    plan = JSON.parse(await readFile(planPath, "utf8")) as SegmentRemakePlan;
  } catch {
    plan = JSON.parse(await readFile(fallbackPlanPath, "utf8")) as SegmentRemakePlan;
  }

  const assetsDir = path.join(outDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const setPlateLocal = path.join(assetsDir, "set-plate-ref-segment.jpg");
  await extractSetPlateJpg(segmentMp4, setPlateLocal, Math.min(1.2, sec * 0.15));
  let refSession: Awaited<ReturnType<typeof resolveEvoLinkImageUrls>>;
  try {
    refSession = await resolveEvoLinkImageUrls({ setPlateLocal, slug });
  } catch (err) {
    throw new Error(
      `${err instanceof Error ? err.message : err}\n${evolinkRefHelpText()}`,
    );
  }

  const model =
    (process.env.EVOLINK_LIPSYNC_MODEL ?? "").trim() ||
    "seedance-2.0-mini-reference-to-video";

  const prompt = `${buildLucaSpeakingVideoPrompt({
    background: plan.backgroundDescription || "clean indoor background",
    action: plan.avatarAction || "friendly presenter, natural gestures",
    spoken: script,
    continuityLock: buildVisualContinuityLock(plan),
  })} @image4 is the exact room reference — match it. Finish every word before stopping.`;

  console.log(`\nEvoLink: one ${sec}s clip, generate_audio=true…`);
  const taskId = await submitReferenceVideoTaskWithOptions({
    prompt,
    durationSec: sec,
    exactDuration: true,
    generateAudio: true,
    model,
    imageUrlsOverride: refSession.imageUrls,
  });
  const videoUrl = await waitForTaskResult(taskId);

  const outputPath = path.join(outDir, `evolink-first-${sec}s.mp4`);
  await downloadToFile(videoUrl, outputPath);
  await ensureH264Mp4(outputPath, { keepAudio: true });

  await writeFile(
    path.join(outDir, `evolink-first-${sec}s-prompt.txt`),
    `${prompt}\n`,
    "utf8",
  );

  await refSession.close();

  console.log("\nDone (single EvoLink, no Remotion):", outputPath);
  console.log("Transcript:", transcriptPath);
  console.log("Compare reference:", segmentMp4);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

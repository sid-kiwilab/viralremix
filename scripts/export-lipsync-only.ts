/**
 * @deprecated Stitches OLD multi-phrase lipsync-seg-* assets — not a fresh 8s EvoLink take.
 * Use: npx tsx scripts/evolink-from-reference-segment.ts --url "..." --sec 8
 *
 * Legacy stitch only:
 *   npx tsx scripts/export-lipsync-only.ts --legacy-stitch --url "..." --sec 8
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { exportRemotionSafeClip } from "@/lib/ffmpeg-transcode";
import { loadLocalEnv } from "@/lib/load-env";
import { readLipsyncClipManifest } from "@/lib/lipsync-clip-manifest";
import { buildLipsyncTimelineEntries } from "@/lib/lipsync-timeline";
import type { SegmentRemakePlan } from "@/lib/segment-analyze";

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

async function main() {
  if (!process.argv.includes("--legacy-stitch")) {
    console.error(
      "This script only stitches old lipsync-seg-* files. For one 8s EvoLink clip from first-8s ASR, run:\n" +
        '  npx tsx scripts/evolink-from-reference-segment.ts --url "<tiktok>" --sec 8\n' +
        "Pass --legacy-stitch only if you really want the old concat.",
    );
    process.exit(1);
  }
  const url = argValue("--url");
  if (!url) {
    throw new Error(
      "Usage: tsx scripts/export-lipsync-only.ts --legacy-stitch --url <url> [--sec 8]",
    );
  }
  const sec = Math.max(1, parseInt(argValue("--sec") ?? "8", 10) || 8);
  const slug = slugFromUrl(url);
  const outDir = path.join(process.cwd(), "out", "recreate", slug);
  const assetsDir = path.join(outDir, "assets");
  const planPath = path.join(outDir, `segment-plan-${sec}s.json`);
  let planPathUsed = planPath;
  let planRaw: string;
  try {
    planRaw = await readFile(planPath, "utf8");
  } catch {
    planPathUsed = path.join(outDir, "segment-plan-16s.json");
    planRaw = await readFile(planPathUsed, "utf8");
  }
  const plan = JSON.parse(planRaw) as SegmentRemakePlan;
  const manifest = await readLipsyncClipManifest(assetsDir);
  const timeline = buildLipsyncTimelineEntries(plan, manifest, sec);
  if (!timeline.length) {
    throw new Error("No lip-sync timeline (missing manifest / assets / transcript).");
  }

  const workDir = path.join(outDir, "work-lipsync-only");
  await mkdir(workDir, { recursive: true });
  const parts: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const span = entry.endSec - entry.timelineStartSec;
    const input = path.join(assetsDir, entry.fileName);
    const part = path.join(workDir, `part-${i}.mp4`);
    console.log(
      `  ${entry.fileName} → ${span.toFixed(2)}s (${entry.text.slice(0, 48)}…)`,
    );
    await exportRemotionSafeClip(input, part, span, true);
    parts.push(part);
  }

  const outputPath = path.join(outDir, `lipsync-only-${sec}s.mp4`);
  const listPath = path.join(workDir, "concat.txt");
  const listBody = parts
    .map((p) => `file '${p.replace(/\\/g, "/")}'`)
    .join("\n");
  await writeFile(listPath, `${listBody}\n`, "utf8");

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outputPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  ).catch(async () => {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        outputPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
  });

  console.log("\nDone (EvoLink lip-sync only, no Remotion):", outputPath);
  console.log("Plan:", planPathUsed);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

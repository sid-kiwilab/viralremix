import path from "node:path";
import { buildLucaSpeakingVideoPrompt } from "@/lib/ai-video-prompt";
import {
  downloadToFile,
  submitReferenceVideoTaskWithOptions,
  waitForTaskResult,
} from "@/lib/evolink";
import { ensureH264Mp4, probeVideoDurationSec } from "@/lib/ffmpeg-transcode";
import type { ResolvedRemixClip } from "@/lib/remix-spec";
import type { SegmentRemakePlan } from "@/lib/segment-analyze";
import { writeLipsyncClipManifest } from "@/lib/lipsync-clip-manifest";
import { mergeSegmentsForLipsync } from "@/lib/segment-lipsync-merge";
import { buildVisualContinuityLock } from "@/lib/segment-visual-continuity";
import type { TranscriptSegment } from "@/lib/segment-transcribe";

const MAX_CLIP_SEC = 8;
const MIN_CLIP_SEC = 4;

function billedDurationForSegment(text: string, seg: TranscriptSegment): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const fromWords = Math.ceil(words * 0.42 + 0.6);
  const fromAsr = Math.ceil((seg.endSec - seg.startSec) * 1.4 + 0.75);
  const need = Math.max(MIN_CLIP_SEC, fromWords, fromAsr);
  return Math.min(MAX_CLIP_SEC, need);
}

/** One EvoLink mini lip-sync clip per phrase, placed on timeline at startSec. */
export async function generateSegmentLipsyncClips(options: {
  segments: TranscriptSegment[];
  plan: SegmentRemakePlan;
  assetsDir: string;
  setPlateUrls: string[];
  model: string;
  /** Drop phrases that start at or after this time (trimmed timeline). */
  timelineDurationSec?: number;
}): Promise<ResolvedRemixClip[]> {
  const bg = options.plan.backgroundDescription || "clean indoor background";
  const action = options.plan.avatarAction || "friendly presenter energy";
  const continuityLock = buildVisualContinuityLock(options.plan);
  const timelineEnd = options.timelineDurationSec ?? Infinity;
  const inTimeline = options.segments.filter(
    (s) => s.startSec < timelineEnd - 0.2,
  );
  const merged = mergeSegmentsForLipsync(inTimeline);
  if (merged.length < options.segments.length) {
    console.log(
      `  Merged ASR: ${options.segments.length} → ${merged.length} lip-sync phrase(s)`,
    );
  }

  const resolved: ResolvedRemixClip[] = [];
  const manifest: { fileName: string; timelineStartSec: number; text: string }[] =
    [];
  for (let index = 0; index < merged.length; index++) {
    const seg = merged[index];
    const text = seg.text.trim();
    if (!text) continue;

    const durationSec = billedDurationForSegment(text, seg);
    const prompt = `${buildLucaSpeakingVideoPrompt({
      background: bg,
      action,
      spoken: text,
      clipIndex: index,
      totalClips: merged.length,
      continuityLock,
    })} @image4 is the exact room reference — match it. Finish every word before stopping.`;

    console.log(
      `  Lip-sync ${index + 1}/${merged.length} @ ${seg.startSec.toFixed(2)}s (${durationSec}s billed, ${text.split(/\s+/).length} words)…`,
    );

    const taskId = await submitReferenceVideoTaskWithOptions({
      prompt,
      durationSec,
      exactDuration: true,
      generateAudio: true,
      model: options.model,
      additionalImageUrls: options.setPlateUrls,
    });
    const url = await waitForTaskResult(taskId);
    const localPath = path.join(options.assetsDir, `lipsync-seg-${index}.mp4`);
    await downloadToFile(url, localPath);
    await ensureH264Mp4(localPath, { keepAudio: true });
    const sourceDurationSec = (await probeVideoDurationSec(localPath)) ?? durationSec;
    const nextStart = merged[index + 1]?.startSec;
    const timelineDurationSec = Math.min(
      sourceDurationSec,
      nextStart !== undefined
        ? Math.max(0.12, nextStart - seg.startSec)
        : sourceDurationSec,
    );

    resolved.push({
      type: "ai-video",
      prompt,
      durationSec: timelineDurationSec,
      localPath,
      sourceDurationSec,
      timelineStartSec: seg.startSec,
      muteEmbeddedAudio: false,
    });
    manifest.push({
      fileName: path.basename(localPath),
      timelineStartSec: seg.startSec,
      text,
    });
  }

  await writeLipsyncClipManifest(options.assetsDir, manifest);
  return resolved;
}

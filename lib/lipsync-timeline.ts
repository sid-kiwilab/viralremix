import path from "node:path";
import type { LipsyncClipManifestEntry } from "@/lib/lipsync-clip-manifest";
import type { ResolvedRemixClip } from "@/lib/remix-spec";
import type { SegmentRemakePlan } from "@/lib/segment-analyze";
import { mergeSegmentsForLipsync } from "@/lib/segment-lipsync-merge";

export type LipsyncTimelineEntry = LipsyncClipManifestEntry & {
  /** Timeline end (sec), exclusive. */
  endSec: number;
};

export function buildLipsyncTimelineEntries(
  plan: SegmentRemakePlan,
  manifest: LipsyncClipManifestEntry[] | null,
  outputDurationSec: number,
): LipsyncTimelineEntry[] {
  const merged = mergeSegmentsForLipsync(plan.transcriptSegments ?? []);
  const raw =
    manifest?.length ?
      manifest
    : merged.map((seg, i) => ({
        fileName: `lipsync-seg-${i}.mp4`,
        timelineStartSec: seg.startSec,
        text: seg.text,
      }));

  if (!raw.length) return [];

  const sorted = [...raw].sort(
    (a, b) => a.timelineStartSec - b.timelineStartSec,
  );
  sorted[0] = { ...sorted[0], timelineStartSec: 0 };

  const out: LipsyncTimelineEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const startSec = i === 0 ? 0 : sorted[i].timelineStartSec;
    const endSec =
      i + 1 < sorted.length ?
        sorted[i + 1].timelineStartSec
      : outputDurationSec;
    if (startSec >= outputDurationSec - 0.05) continue;
    out.push({
      ...sorted[i],
      timelineStartSec: startSec,
      endSec: Math.min(outputDurationSec, endSec),
    });
  }
  return out;
}

export function lipsyncTimelineToResolvedClips(
  entries: LipsyncTimelineEntry[],
  assetsDir: string,
  sourceDurationByFile: Map<string, number>,
): ResolvedRemixClip[] {
  const resolved: ResolvedRemixClip[] = [];
  for (const entry of entries) {
    const span = entry.endSec - entry.timelineStartSec;
    if (span <= 0.05) continue;
    const sourceDurationSec = sourceDurationByFile.get(entry.fileName);
    const durationSec = Math.min(span, sourceDurationSec ?? span);
    resolved.push({
      type: "ai-video",
      prompt: "",
      durationSec,
      localPath: path.join(assetsDir, entry.fileName),
      sourceDurationSec,
      timelineStartSec: entry.timelineStartSec,
      muteEmbeddedAudio: false,
    });
  }
  return resolved;
}

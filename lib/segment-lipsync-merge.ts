import type { TranscriptSegment } from "@/lib/segment-transcribe";

/** Fewer, longer phrase clips → less cut-off speech and fewer posture jumps. */
export function mergeSegmentsForLipsync(
  segments: TranscriptSegment[],
  maxSpanSec = 7.5,
  maxGapSec = 0.55,
): TranscriptSegment[] {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const out: TranscriptSegment[] = [];
  let buf: TranscriptSegment | null = null;

  for (const seg of sorted) {
    const text = seg.text.trim();
    if (!text) continue;
    if (!buf) {
      buf = { ...seg, text };
      continue;
    }
    const gap = seg.startSec - buf.endSec;
    const mergedSpan = seg.endSec - buf.startSec;
    if (gap <= maxGapSec && mergedSpan <= maxSpanSec) {
      buf = {
        startSec: buf.startSec,
        endSec: seg.endSec,
        text: `${buf.text} ${text}`.trim(),
      };
    } else {
      out.push(buf);
      buf = { ...seg, text };
    }
  }
  if (buf) out.push(buf);
  return out;
}

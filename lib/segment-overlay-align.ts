import type { SegmentTextOverlay } from "@/lib/segment-analyze";
import type { TranscriptWord } from "@/lib/segment-transcribe";

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsToTimeline(words: TranscriptWord[]): TranscriptWord[] {
  return [...words].sort((a, b) => a.startSec - b.startSec);
}

/** Align bottom/center caption windows to ASR word timestamps when text matches. */
export function alignOverlaysToTranscriptWords(
  overlays: SegmentTextOverlay[],
  words: TranscriptWord[],
  durationSec: number,
): SegmentTextOverlay[] {
  if (!words.length) return overlays;

  const timeline = wordsToTimeline(words);
  const flat = timeline.map((w) => w.word).join(" ");
  const flatNorm = normalizeForMatch(flat);

  return overlays.map((o) => {
    if (o.style !== "caption-yellow" && o.position !== "bottom") return o;
    const needle = normalizeForMatch(o.text);
    if (needle.length < 4) return o;

    const idx = flatNorm.indexOf(needle);
    if (idx === -1) return o;

    const before = flatNorm.slice(0, idx).trim();
    const beforeWords = before ? before.split(" ").length : 0;
    const needleWordCount = needle.split(" ").length;

    const startWord = timeline[beforeWords];
    const endWord = timeline[beforeWords + needleWordCount - 1];
    if (!startWord || !endWord) return o;

    return {
      ...o,
      startSec: Math.max(0, Math.round(startWord.startSec * 1000) / 1000),
      endSec: Math.min(
        durationSec,
        Math.round(endWord.endSec * 1000) / 1000,
      ),
    };
  });
}

/** Drop consecutive duplicate caption lines (vision ASR double-count). */
export function dedupeOverlayCaptions(
  overlays: SegmentTextOverlay[],
): SegmentTextOverlay[] {
  const out: SegmentTextOverlay[] = [];
  let prevBottom = "";
  for (const o of overlays) {
    if (o.position === "bottom" && o.style === "caption-yellow") {
      const key = normalizeForMatch(o.text);
      if (key && key === prevBottom) continue;
      prevBottom = key;
    }
    out.push(o);
  }
  return out;
}

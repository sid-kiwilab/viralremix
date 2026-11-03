import type { SegmentRemakePlan, SegmentTextOverlay } from "@/lib/segment-analyze";
import type { TranscriptSegment, TranscriptWord } from "@/lib/segment-transcribe";
import { normalizeSegmentOverlays } from "@/lib/segment-overlay-normalize";

const HERO_VOCAB = /^(merhaba|selam|benim adım|benim adim)/i;

function headerTitleFromPlan(plan: SegmentRemakePlan): string {
  const top = plan.textOverlays.find((o) => o.position === "top");
  const raw = top?.text ?? "Turkish Basics";
  return raw
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, "")
    .replace(/🇹🇷/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Turkish Basics";
}

function headerFromPlan(plan: SegmentRemakePlan, durationSec: number): SegmentTextOverlay {
  const top = plan.textOverlays.find((o) => o.position === "top");
  const endSec = Math.min(
    durationSec,
    top?.endSec && top.endSec > 0 ? top.endSec : 3.2,
  );
  return {
    text: headerTitleFromPlan(plan),
    startSec: 0,
    endSec,
    position: "top",
    style: "header-pill",
    fontSize: "large",
    color: "#FFFFFF",
  };
}

function captionLine(
  text: string,
  startSec: number,
  endSec: number,
): SegmentTextOverlay {
  return {
    text,
    startSec,
    endSec,
    position: "bottom",
    style: "caption-yellow",
    fontSize: "medium",
    color: "#FFE135",
  };
}

/** One TikTok-style yellow line at a time (comma / clause splits). */
function captionsFromSegment(seg: TranscriptSegment): SegmentTextOverlay[] {
  const raw = seg.text.trim();
  if (!raw) return [];

  const parts = raw
    .split(/(?<=[,;:])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [captionLine(raw, seg.startSec, seg.endSec)];
  }

  const total = seg.endSec - seg.startSec;
  const weights = parts.map((p) => Math.max(1, p.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = seg.startSec;
  const out: SegmentTextOverlay[] = [];

  for (let i = 0; i < parts.length; i++) {
    const endSec =
      i === parts.length - 1
        ? seg.endSec
        : t + (total * weights[i]) / sum;
    out.push(captionLine(parts[i], t, endSec));
    t = endSec;
  }
  return out;
}

function heroForWordSpan(
  label: string,
  startSec: number,
  endSec: number,
): SegmentTextOverlay {
  const minHold = 0.85;
  return {
    text: label.replace(/\.$/, ""),
    startSec,
    endSec: Math.max(endSec, startSec + minHold),
    position: "center",
    style: "word-hero",
    fontSize: "large",
    color: "#FFFFFF",
  };
}

/** Build Remotion overlays from ASR (captions + vocabulary heroes), not vision guesses. */
export function buildOverlaysFromTranscript(
  plan: SegmentRemakePlan,
  segments: TranscriptSegment[],
  words: TranscriptWord[],
  durationSec: number,
): SegmentTextOverlay[] {
  const overlays: SegmentTextOverlay[] = [headerFromPlan(plan, durationSec)];

  for (const seg of segments) {
    const t = seg.text.trim();
    if (!t) continue;
    const isHeroOnly =
      HERO_VOCAB.test(t) && t.split(/\s+/).length <= 3 && !t.includes(",");
    if (isHeroOnly) continue;
    overlays.push(...captionsFromSegment(seg));
  }

  const heroSpans: { label: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const pair = next ? `${w.word} ${next.word}`.replace(/\./g, "") : w.word;
    if (/^benim adım$/i.test(pair.replace(/\./g, ""))) {
      heroSpans.push({
        label: "Benim adım",
        start: w.startSec,
        end: next.endSec,
      });
      i++;
      continue;
    }
    if (/^merhaba\.?$/i.test(w.word)) {
      heroSpans.push({ label: "Merhaba", start: w.startSec, end: w.endSec });
    }
    if (/^selam\.?$/i.test(w.word)) {
      heroSpans.push({ label: "Selam", start: w.startSec, end: w.endSec });
    }
  }

  for (const h of heroSpans) {
    overlays.push(heroForWordSpan(h.label, h.start, h.end));
  }

  return normalizeSegmentOverlays(overlays, durationSec);
}

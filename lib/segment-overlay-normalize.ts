import type { SegmentTextOverlay } from "@/lib/segment-analyze";

function intervalsOverlap(
  a: { startSec: number; endSec: number },
  b: { startSec: number; endSec: number },
): boolean {
  return a.startSec < b.endSec && b.startSec < a.endSec;
}

function isMostlyEmoji(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^[\p{Extended_Pictographic}\s]+$/u.test(t) && t.length <= 8;
}

function mergeTopBarGroup(group: SegmentTextOverlay[]): SegmentTextOverlay {
  const startSec = Math.min(...group.map((o) => o.startSec));
  const endSec = Math.max(...group.map((o) => o.endSec));
  let title = "";
  let emoji = "";
  for (const o of group) {
    const t = o.text.trim();
    if (isMostlyEmoji(t)) emoji = emoji || t;
    else if (!title.includes(t)) title = title ? `${title} ${t}` : t;
  }
  if (emoji && !title.includes(emoji)) {
    title = title.includes("Basics")
      ? title.replace(/\s*$/, ` ${emoji}`)
      : `${title} ${emoji}`.trim();
  }
  return {
    text: title.trim(),
    startSec,
    endSec,
    position: "top",
    style: "header-pill",
    color: group.find((g) => g.color)?.color ?? "#FFFFFF",
    fontSize: "large",
  };
}

function mergeOverlappingTopBars(
  overlays: SegmentTextOverlay[],
): SegmentTextOverlay[] {
  const tops = overlays.filter((o) => o.position === "top");
  const rest = overlays.filter((o) => o.position !== "top");
  if (tops.length <= 1) return overlays;

  const groups: SegmentTextOverlay[][] = [];
  for (const o of tops) {
    const g = groups.find((grp) =>
      grp.some((x) => intervalsOverlap(x, o)),
    );
    if (g) g.push(o);
    else groups.push([o]);
  }

  const mergedTops =
    groups.length === 1 && groups[0].length > 1
      ? [mergeTopBarGroup(groups[0])]
      : groups.map((g) => (g.length > 1 ? mergeTopBarGroup(g) : g[0]));

  return [...mergedTops, ...rest].sort((a, b) => a.startSec - b.startSec);
}

/** One bottom caption per instant — drop shorter duplicate lanes (analyzer sometimes doubles). */
/** Yellow captions clash with center vocabulary — hide bottom lane while hero shows. */
function hideBottomDuringHero(
  overlays: SegmentTextOverlay[],
): SegmentTextOverlay[] {
  const heroes = overlays.filter((o) => o.style === "word-hero");
  if (!heroes.length) return overlays;

  return overlays
    .map((o) => {
      if (o.position !== "bottom") return o;
      for (const h of heroes) {
        if (intervalsOverlap(o, h)) {
          if (o.startSec >= h.startSec - 0.05 && o.endSec <= h.endSec + 0.05) {
            return null;
          }
          if (
            o.startSec < h.endSec &&
            o.endSec > h.startSec &&
            o.startSec >= h.startSec
          ) {
            return { ...o, endSec: Math.min(o.endSec, h.startSec) };
          }
        }
      }
      return o;
    })
    .filter((o): o is SegmentTextOverlay => o !== null && o.endSec > o.startSec);
}

function dedupeBottomCaptions(
  overlays: SegmentTextOverlay[],
): SegmentTextOverlay[] {
  const bottoms = overlays
    .filter((o) => o.position === "bottom")
    .sort((a, b) => a.startSec - b.startSec);
  const rest = overlays.filter((o) => o.position !== "bottom");
  const kept: SegmentTextOverlay[] = [];
  for (const o of bottoms) {
    const clash = kept.find(
      (k) => intervalsOverlap(k, o) && k.text !== o.text,
    );
    if (!clash) kept.push(o);
  }
  return [...rest.filter((o) => o.position !== "bottom"), ...kept].sort(
    (a, b) => a.startSec - b.startSec,
  );
}

function fixOverlayStyles(o: SegmentTextOverlay): SegmentTextOverlay {
  let style = o.style;
  if (o.position === "bottom" && !style) style = "caption-yellow";
  if (o.position === "top" && !style) style = "header-pill";
  if (style === "header-pill" && o.position === "center") {
    style = "word-hero";
  }
  if (
    o.position === "center" &&
    (style === "plain" || style === "header-pill" || !style)
  ) {
    style = "word-hero";
  }
  let text = o.text.trim();
  if (style === "word-hero" && text.includes("/")) {
    const primary = text.split("/")[0]?.trim();
    if (primary) text = primary;
  }
  return { ...o, text, ...(style ? { style } : {}) };
}

/** Prepare analyzer overlays for Remotion (single header, proper lanes, no stacked pills). */
export function normalizeSegmentOverlays(
  overlays: SegmentTextOverlay[],
  durationSec: number,
): SegmentTextOverlay[] {
  let items = overlays.map(fixOverlayStyles);
  items = mergeOverlappingTopBars(items);
  items = hideBottomDuringHero(items);
  items = dedupeBottomCaptions(items);
  return items
    .map((o) => ({
      ...o,
      startSec: Math.max(0, o.startSec),
      endSec: Math.min(durationSec, o.endSec),
    }))
    .filter((o) => o.endSec > o.startSec);
}

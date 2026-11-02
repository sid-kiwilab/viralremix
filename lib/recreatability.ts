export type RecreatabilityBand = "high" | "medium" | "low";

export type RecreatabilityDimensions = {
  durationFit: number;
  subjectMotion: number;
  cameraMotion: number;
  speechLipSync: number;
  sceneComplexity: number;
  textOverlays: number;
  identity: number;
  audioSync: number;
};

export type RecreatabilityAnalysis = {
  overallScore: number;
  band: RecreatabilityBand;
  dimensions: RecreatabilityDimensions;
  hook: string;
  beats: string[];
  onScreenText: string[];
  speechSummary: string;
  remakesWell: string[];
  remakesPoorly: string[];
  canDrop: string[];
  summary: string;
};

/** Bump when RECREATABILITY_SYSTEM_PROMPT or buildRecreatabilityUserPrompt changes. */
export const PROMPT_VERSION = 2;

const DIMENSION_KEYS: (keyof RecreatabilityDimensions)[] = [
  "durationFit",
  "subjectMotion",
  "cameraMotion",
  "speechLipSync",
  "sceneComplexity",
  "textOverlays",
  "identity",
  "audioSync",
];

export const RECREATABILITY_SYSTEM_PROMPT = `You analyze short-form social videos (Instagram Reels, TikTok) for how remakeable their FORMAT is with tools available in 2026.

Score a practical AI remake plan — not a pixel-perfect clone of the original.

Be honest and conservative — do not inflate scores.

Observation (hook, beats, speechSummary, onScreenText):
- Describe only what is visibly and audibly in the clip. Do not invent gestures, props, or sync.
- A character highlight or color change on text/graphics is NOT pointing unless you clearly see a hand or finger touch that target.
- If the subject is mostly still and text or graphics change, say that; do not assume pointing, dancing, or complex motion.

Remake mindset:
- Assume we can drop anything current AI is bad at IF the same format effect still works (e.g. voiceover + timed text highlights instead of lip-sync; generic presenter instead of a specific face; no pointing if highlights alone carry the lesson).
- List those simplifications in canDrop.
- remakesWell: what the simplified remake leans on.
- remakesPoorly: only obstacles that stay REQUIRED for the format after dropping optional complexity — not "original had speech" if we can use VO without on-camera lip-sync.

2026 recreation reality:
- Still image generation can look hyper-real; minimal subject motion can often be images + light motion.
- Video generation works best per segment in roughly 4–8 second chunks; longer clips are usually several segments stitched in edit unless the hook is one unbroken continuous take (single-shot reveal, unbroken dance, no natural cut points).
- durationFit: high when the format repeats or can be cut into 4–8s segments; low only when the whole hook must stay one continuous take.
- Fast body motion (dance, sports, fights), handheld/whip pans, crowds, and multi-person choreography remain hard.
- On-screen text, captions, and beat-synced cuts are relatively easy in post.
- Score speechLipSync, identity, and subjectMotion for the REMAKE PLAN (after canDrop), not for matching the original performer.

Score each dimension 0–100 where HIGHER means EASIER to recreate with current AI video/image tools.
Compute overallScore as a weighted judgment (not a naive average) for the simplified remake plan.

Return ONLY valid JSON matching this exact shape (no markdown, no commentary):
{
  "overallScore": number,
  "band": "high" | "medium" | "low",
  "dimensions": {
    "durationFit": number,
    "subjectMotion": number,
    "cameraMotion": number,
    "speechLipSync": number,
    "sceneComplexity": number,
    "textOverlays": number,
    "identity": number,
    "audioSync": number
  },
  "hook": string,
  "beats": string[],
  "onScreenText": string[],
  "speechSummary": string,
  "remakesWell": string[],
  "remakesPoorly": string[],
  "canDrop": string[],
  "summary": string
}

Band rules: high = overallScore >= 70, medium = 40–69, low = below 40.`;

/** Base user prompt when duration is unknown (logs / fallback). */
export const RECREATABILITY_USER_PROMPT =
  "Watch this entire clip (visual + audio). Describe the format accurately and score recreatability for a simplified AI remake as specified.";

export function buildRecreatabilityUserPrompt(durationSec: number | null): string {
  if (durationSec !== null && Number.isFinite(durationSec) && durationSec > 0) {
    const rounded = Math.round(durationSec * 10) / 10;
    return `${RECREATABILITY_USER_PROMPT} The browser reports this clip is about ${rounded} seconds long — use that for durationFit (segment/stitch plan), not as a reason to penalize length by itself.`;
  }
  return RECREATABILITY_USER_PROMPT;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isBand(value: unknown): value is RecreatabilityBand {
  return value === "high" || value === "medium" || value === "low";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseDimensions(raw: unknown): RecreatabilityDimensions | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as RecreatabilityDimensions;
  for (const key of DIMENSION_KEYS) {
    const v = obj[key];
    if (typeof v !== "number") return null;
    out[key] = clampScore(v);
  }
  return out;
}

function bandFromScore(score: number): RecreatabilityBand {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseRecreatabilityAnalysis(rawText: string): RecreatabilityAnalysis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawText));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const dimensions = parseDimensions(obj.dimensions);
  if (!dimensions) return null;

  const overallScore = clampScore(
    typeof obj.overallScore === "number" ? obj.overallScore : 0,
  );
  let band = isBand(obj.band) ? obj.band : bandFromScore(overallScore);
  const expected = bandFromScore(overallScore);
  if (
    (band === "high" && overallScore < 70) ||
    (band === "medium" && (overallScore < 40 || overallScore >= 70)) ||
    (band === "low" && overallScore >= 40)
  ) {
    band = expected;
  }

  const hook = typeof obj.hook === "string" ? obj.hook.trim() : "";
  const speechSummary =
    typeof obj.speechSummary === "string" ? obj.speechSummary.trim() : "";
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  if (!hook || !summary) return null;

  return {
    overallScore,
    band,
    dimensions,
    hook,
    beats: parseStringArray(obj.beats),
    onScreenText: parseStringArray(obj.onScreenText),
    speechSummary,
    remakesWell: parseStringArray(obj.remakesWell),
    remakesPoorly: parseStringArray(obj.remakesPoorly),
    canDrop: parseStringArray(obj.canDrop),
    summary,
  };
}

export const DIMENSION_LABELS: Record<keyof RecreatabilityDimensions, string> = {
  durationFit: "Duration fit",
  subjectMotion: "Subject motion",
  cameraMotion: "Camera motion",
  speechLipSync: "Speech / lip-sync",
  sceneComplexity: "Scene complexity",
  textOverlays: "Text / overlays",
  identity: "Identity / face",
  audioSync: "Audio / beat sync",
};

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
  summary: string;
};

/** Bump when RECREATABILITY_SYSTEM_PROMPT or RECREATABILITY_USER_PROMPT changes. */
export const PROMPT_VERSION = 1;

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

export const RECREATABILITY_SYSTEM_PROMPT = `You analyze short-form social videos (Instagram Reels, TikTok) for how remakeable they are with tools available in 2026.

Be honest and conservative — do not inflate scores.

2026 recreation reality:
- Still image generation can look hyper-real; a frame that barely moves can often be faked with images + light motion.
- Video generation works best for 3–8 second clips, minimal subject motion, simple camera, and when lip-sync does not need to match visible speech.
- Fast body motion (dance, sports, fights), handheld/whip pans, crowds, multi-person choreography, and on-camera talking with visible lips are hard or unreliable.
- On-screen text, captions, and beat-synced cuts are relatively easy to recreate in post.
- Specific recognizable celebrities or unique faces are harder than generic subjects.

Score each dimension 0–100 where HIGHER means EASIER to recreate with current AI video/image tools.
Compute overallScore as a weighted judgment (not a naive average); cap overall below 40 for clips dominated by dance, sports, or lip-synced talking head longer than ~10s.

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
  "summary": string
}

Band rules: high = overallScore >= 70, medium = 40–69, low = below 40.`;

export const RECREATABILITY_USER_PROMPT =
  "Watch this entire clip (visual + audio). Describe the format and score recreatability for AI remake as specified.";

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

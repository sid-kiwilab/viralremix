import { readFile } from "node:fs/promises";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_VIDEO_MODEL = "google/gemini-2.5-flash";

export type SegmentOverlayStyle =
  | "header-pill"
  | "caption-yellow"
  | "word-hero"
  | "plain";

export type SegmentTextOverlay = {
  text: string;
  startSec: number;
  endSec: number;
  position: "top" | "center" | "bottom";
  emphasis?: boolean;
  color?: string;
  fontSize?: "large" | "medium";
  style?: SegmentOverlayStyle;
};

export type SegmentRemakePlan = {
  durationSec: number;
  spokenPhrase: string;
  /** Describe set/background to match original (for AI video prompt). */
  backgroundDescription: string;
  avatarAction: string;
  textOverlays: SegmentTextOverlay[];
  brandOrLogoNotes: string;
  hook: string;
  /** Frozen set + Luca wardrobe for every chained clip (same text each EvoLink job). */
  visualContinuityLock?: string;
  /** Match original TikTok presenter: seated | standing */
  presenterPose?: "seated" | "standing";
  /** Word-timed ASR (when transcribe pass ran). */
  transcriptSegments?: Array<{
    startSec: number;
    endSec: number;
    text: string;
  }>;
  transcriptWords?: Array<{
    word: string;
    startSec: number;
    endSec: number;
  }>;
  spokenPhraseSource?: "asr" | "vision";
};

export const SEGMENT_REMAKE_SYSTEM_PROMPT = `You analyze the FIRST N seconds of a short-form ad/tutorial video for an exact Remotion + AI avatar remake.

Watch the clip frame-by-frame. Return ONLY valid JSON (no markdown):
{
  "durationSec": number,
  "spokenPhrase": string,
  "backgroundDescription": string,
  "avatarAction": string,
  "textOverlays": [
    {
      "text": string,
      "startSec": number,
      "endSec": number,
      "position": "top" | "center" | "bottom",
      "emphasis": boolean (optional),
      "color": string (optional, e.g. "#FFFFFF", "#FFD700"),
      "fontSize": "large" | "medium" (optional),
      "style": "header-pill" | "caption-yellow" | "word-hero" | "plain" (optional)
    }
  ],
  "brandOrLogoNotes": string,
  "hook": string,
  "visualContinuityLock": string,
  "presenterPose": "seated" | "standing"
}

Rules:
- Time all overlays within 0..durationSec with 0.1s precision.
- spokenPhrase: exact English words spoken on camera in this segment (or "" if none).
- backgroundDescription: wall color, furniture, props, lighting — match the original set.
- visualContinuityLock: ONE paragraph for our avatar Luca (not the original creator): exact shirt color/style matching a simple presenter look, fixed tripod framing, and the same room/props/lighting that must repeat identically across every 8s video segment — no drift between cuts.
- avatarAction: how Luca moves (gestures, expression) — MUST match original posture (e.g. hand gestures while seated).
- presenterPose: "seated" or "standing" — copy the ORIGINAL presenter in the source clip, not a generic standing host.
- List EVERY on-screen text/graphic change with its own overlay row and timing (for Remotion post — the AI avatar clip will NOT render this text).
- brandOrLogoNotes: describe visible logos/branding for reference only; they are recreated in Remotion, not in the AI video.
- style: "header-pill" = ONE top title bar only (combine flag + title in a single overlay row, e.g. "Turkish Basics 🇹🇷"). "caption-yellow" = bottom TikTok captions (one phrase at a time, timed). "word-hero" = large vocabulary word centered on screen (e.g. "Merhaba"), not a black pill. Never use two overlapping top pills.
- Do not invent text that is not visible in the clip.`;

function bufferToVideoDataUrl(video: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${video.toString("base64")}`;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseSegmentRemakePlan(rawText: string): SegmentRemakePlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawText));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const durationSec =
    typeof o.durationSec === "number" && o.durationSec > 0 ? o.durationSec : 4;
  const spokenPhrase =
    typeof o.spokenPhrase === "string" ? o.spokenPhrase.trim() : "";
  const backgroundDescription =
    typeof o.backgroundDescription === "string"
      ? o.backgroundDescription.trim()
      : "";
  const avatarAction =
    typeof o.avatarAction === "string" ? o.avatarAction.trim() : "";
  const brandOrLogoNotes =
    typeof o.brandOrLogoNotes === "string" ? o.brandOrLogoNotes.trim() : "";
  const hook = typeof o.hook === "string" ? o.hook.trim() : "";
  const visualContinuityLock =
    typeof o.visualContinuityLock === "string"
      ? o.visualContinuityLock.trim()
      : "";
  const presenterPoseRaw =
    typeof o.presenterPose === "string" ? o.presenterPose.trim().toLowerCase() : "";
  const presenterPose =
    presenterPoseRaw === "seated" || presenterPoseRaw === "sitting"
      ? ("seated" as const)
      : presenterPoseRaw === "standing"
        ? ("standing" as const)
        : undefined;

  const textOverlays: SegmentTextOverlay[] = [];
  if (Array.isArray(o.textOverlays)) {
    for (const raw of o.textOverlays) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      const text = typeof t.text === "string" ? t.text.trim() : "";
      if (!text) continue;
      const startSec = typeof t.startSec === "number" ? t.startSec : 0;
      const endSec = typeof t.endSec === "number" ? t.endSec : startSec + 1;
      const position =
        t.position === "top" || t.position === "bottom" || t.position === "center"
          ? t.position
          : "center";
      const style =
        t.style === "header-pill" ||
        t.style === "caption-yellow" ||
        t.style === "word-hero" ||
        t.style === "plain"
          ? t.style
          : undefined;
      textOverlays.push({
        text,
        startSec,
        endSec,
        position,
        ...(t.emphasis === true ? { emphasis: true } : {}),
        ...(typeof t.color === "string" ? { color: t.color } : {}),
        ...(t.fontSize === "large" || t.fontSize === "medium"
          ? { fontSize: t.fontSize }
          : {}),
        ...(style ? { style } : {}),
      });
    }
  }

  if (!backgroundDescription && !spokenPhrase && textOverlays.length === 0) {
    return null;
  }

  return {
    durationSec: Math.min(20, durationSec),
    spokenPhrase,
    backgroundDescription,
    avatarAction,
    textOverlays,
    brandOrLogoNotes,
    hook,
    ...(visualContinuityLock ? { visualContinuityLock } : {}),
    ...(presenterPose ? { presenterPose } : {}),
  };
}

export async function analyzeSegmentRemake(
  videoPath: string,
  segmentSec: number,
  signal?: AbortSignal,
): Promise<
  | { ok: true; plan: SegmentRemakePlan; rawText: string }
  | { ok: false; error: string }
> {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: "Missing OPENROUTER_API_KEY." };
  }

  const model = (process.env.OPENROUTER_VIDEO_MODEL ?? "").trim() || DEFAULT_VIDEO_MODEL;
  const video = await readFile(videoPath);
  const videoUrl = bufferToVideoDataUrl(video, "video/mp4");
  const userText = `Analyze ONLY the first ${segmentSec} seconds of this clip. The file may be trimmed to ${segmentSec}s already. Produce a precise remake plan for our house avatar (Luca) with Remotion text overlays synced to the original timing.`;

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/sid-kiwilab/viralremix",
      "X-Title": "Viral Remix Segment",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SEGMENT_REMAKE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "video_url",
              video_url: { url: videoUrl, processing: "static" },
            },
          ],
        },
      ],
    }),
    signal: signal ?? AbortSignal.timeout(120_000),
  });

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      error: data.error?.message?.trim() || `OpenRouter failed (${response.status}).`,
    };
  }

  const rawText = data.choices?.[0]?.message?.content ?? "";
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { ok: false, error: "Empty model response." };
  }

  const plan = parseSegmentRemakePlan(rawText);
  if (!plan) {
    return { ok: false, error: "Invalid segment plan JSON." };
  }

  plan.durationSec = segmentSec;

  return { ok: true, plan, rawText };
}

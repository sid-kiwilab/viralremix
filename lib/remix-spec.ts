export type TextOverlayPosition = "top" | "center" | "bottom";

export type RemixClipSpec = {
  type: "ai-video";
  prompt: string;
  durationSec: number;
};

export type RemixDisplayMode = "default" | "character-strip";

export type RemixTextOverlaySpec = {
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
  /** Active beat — green highlight in character-strip mode. */
  emphasis?: boolean;
  /** CSS color for Remotion overlay text (e.g. #FFFF00). */
  color?: string;
  style?: "header-pill" | "caption-yellow" | "word-hero" | "plain";
  fontSize?: "large" | "medium";
};

export type RemixVoSpec = {
  type: "vo";
  text: string;
  startSec: number;
};

export type RemixOutputSpec = {
  width: 1080;
  height: 1920;
  fps: 30;
  durationSec: number;
};

export type RemixSpec = {
  characterId: "luca";
  clips: RemixClipSpec[];
  textOverlays: RemixTextOverlaySpec[];
  audio: RemixVoSpec[];
  output: RemixOutputSpec;
  /** Ordered characters for strip UI (timed lesson formats). */
  lessonCharacters?: string[];
  displayMode?: RemixDisplayMode;
};

export type ResolvedRemixClip = RemixClipSpec & {
  localPath: string;
  /** Measured after download (for Remotion loop timing). */
  sourceDurationSec?: number;
  /** Absolute timeline start (sec). If set, clip is not chained back-to-back. */
  timelineStartSec?: number;
  /** When false, Remotion keeps embedded clip audio (lip-sync). */
  muteEmbeddedAudio?: boolean;
};

export type ResolvedRemixVo = RemixVoSpec & {
  localPath: string;
};

/** Spec with local asset paths for Remotion render. */
export type ResolvedRemixSpec = Omit<RemixSpec, "clips" | "audio"> & {
  clips: ResolvedRemixClip[];
  audio: ResolvedRemixVo[];
};

export const REMIX_MIN_SCORE = 60;
export const REMIX_MAX_DURATION_SEC = 15;
export const REMIX_CLIP_MIN_SEC = 4;
export const REMIX_CLIP_MAX_SEC = 8;
export const REMIX_MAX_CLIPS = 2;
export const REMIX_MAX_VO_TRACKS = 20;
export const REMIX_MAX_OVERLAYS = 20;

const POSITIONS: TextOverlayPosition[] = ["top", "center", "bottom"];

function clampDurationSec(n: number): number {
  if (!Number.isFinite(n)) return REMIX_CLIP_MIN_SEC;
  return Math.max(REMIX_CLIP_MIN_SEC, Math.min(REMIX_CLIP_MAX_SEC, Math.round(n)));
}

function isPosition(value: unknown): value is TextOverlayPosition {
  return typeof value === "string" && POSITIONS.includes(value as TextOverlayPosition);
}

function parseClip(raw: unknown): RemixClipSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== "ai-video") return null;
  const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
  if (!prompt) return null;
  const durationSec = clampDurationSec(
    typeof obj.durationSec === "number" ? obj.durationSec : REMIX_CLIP_MIN_SEC,
  );
  return { type: "ai-video", prompt, durationSec };
}

function parseOverlay(raw: unknown): RemixTextOverlaySpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return null;
  const startSec = typeof obj.startSec === "number" ? obj.startSec : 0;
  const endSec = typeof obj.endSec === "number" ? obj.endSec : startSec + 2;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    return null;
  }
  const position = isPosition(obj.position) ? obj.position : "center";
  const emphasis =
    obj.emphasis === true || obj.emphasis === false ? obj.emphasis : undefined;
  const color = typeof obj.color === "string" ? obj.color.trim() : undefined;
  const style =
    obj.style === "header-pill" ||
    obj.style === "caption-yellow" ||
    obj.style === "word-hero" ||
    obj.style === "plain"
      ? obj.style
      : undefined;
  const fontSize =
    obj.fontSize === "large" || obj.fontSize === "medium"
      ? obj.fontSize
      : undefined;
  return {
    text,
    startSec,
    endSec,
    position,
    ...(emphasis !== undefined ? { emphasis } : {}),
    ...(color ? { color } : {}),
    ...(style ? { style } : {}),
    ...(fontSize ? { fontSize } : {}),
  };
}

function parseVo(raw: unknown): RemixVoSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== "vo") return null;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return null;
  const startSec = typeof obj.startSec === "number" && obj.startSec >= 0 ? obj.startSec : 0;
  return { type: "vo", text, startSec };
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

export function parseRemixSpec(rawText: string): RemixSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawText));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.characterId !== "luca") return null;

  if (!Array.isArray(obj.clips)) return null;
  const clips = obj.clips
    .map(parseClip)
    .filter((c): c is RemixClipSpec => c !== null)
    .slice(0, REMIX_MAX_CLIPS);
  if (clips.length === 0) return null;

  const clipDurationTotal = clips.reduce((sum, c) => sum + c.durationSec, 0);
  if (clipDurationTotal > REMIX_MAX_DURATION_SEC) return null;

  const textOverlays = Array.isArray(obj.textOverlays)
    ? obj.textOverlays
        .map(parseOverlay)
        .filter((o): o is RemixTextOverlaySpec => o !== null)
        .slice(0, REMIX_MAX_OVERLAYS)
    : [];

  const audio = Array.isArray(obj.audio)
    ? obj.audio
        .map(parseVo)
        .filter((a): a is RemixVoSpec => a !== null)
        .slice(0, REMIX_MAX_VO_TRACKS)
    : [];

  const overlayEndSec = textOverlays.reduce(
    (max, o) => Math.max(max, o.endSec),
    0,
  );
  const durationSec = Math.min(
    REMIX_MAX_DURATION_SEC,
    Math.max(clipDurationTotal, overlayEndSec),
  );

  const lessonCharacters = Array.isArray(obj.lessonCharacters)
    ? obj.lessonCharacters
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim())
        .slice(0, REMIX_MAX_OVERLAYS)
    : undefined;

  const displayMode =
    obj.displayMode === "character-strip" || obj.displayMode === "default"
      ? obj.displayMode
      : undefined;

  return {
    characterId: "luca",
    clips,
    textOverlays,
    audio,
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec,
    },
    ...(lessonCharacters?.length ? { lessonCharacters } : {}),
    ...(displayMode ? { displayMode } : {}),
  };
}

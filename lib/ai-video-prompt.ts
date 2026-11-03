/**
 * EvoLink / Seedance video prompts — Luca reference-to-video.
 * All on-screen text, pills, captions, and logos belong in Remotion, never in the AI clip.
 */

export const LUCA_IMAGE_TAGS = "@image1 @image2 @image3";

/** Appended to every reference-to-video submit (see evolink.ts). */
export const AI_VIDEO_NO_BURNED_GRAPHICS_RULE =
  "Clean video only: NO on-screen text, NO captions, NO subtitles, NO logos, NO UI, NO watermarks, NO graphics burned into the frame. All typography and overlays are added in post-production.";

export function ensureNoBurnedGraphicsInPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const already =
    lower.includes("no on-screen text") ||
    lower.includes("no captions") ||
    lower.includes("clean video only");
  if (already && lower.includes("post-production")) return trimmed;
  return `${trimmed} ${AI_VIDEO_NO_BURNED_GRAPHICS_RULE}`.trim();
}

export function buildLucaSpeakingVideoPrompt(parts: {
  background: string;
  action: string;
  spoken: string;
  /** 0-based index when chaining 8s clips */
  clipIndex?: number;
  totalClips?: number;
  /** Frozen wardrobe + set — same string on every clip in a segment */
  continuityLock?: string;
}): string {
  const lock =
    parts.continuityLock?.trim() ||
    `Luca MUST match ${LUCA_IMAGE_TAGS} — identical outfit, hair, and room every clip.`;

  const clipIndex = parts.clipIndex ?? 0;
  const totalClips = parts.totalClips ?? 1;
  const continuation =
    totalClips > 1 && clipIndex > 0
      ? `CONTINUATION segment ${clipIndex + 1}/${totalClips} of ONE continuous take — seamless match to the previous segment: same wardrobe, same background, same lighting, same camera. `
      : totalClips > 1
        ? `Segment 1/${totalClips} — establish a look that MUST repeat identically in all following segments. `
        : "";

  return ensureNoBurnedGraphicsInPrompt(
    [
      `Luca as ${LUCA_IMAGE_TAGS}, facing camera, medium close-up, static tripod, same seated/standing pose in every segment.`,
      continuation,
      `VISUAL LOCK (do not change): ${lock}`,
      `Environment: ${parts.background}.`,
      `Motion: ${parts.action}.`,
      `Speak ONLY this exact script once, natural lip-sync, do not improvise or repeat lines: "${parts.spoken}"`,
      "Subtle gestures only. Same shirt and room as reference photos throughout.",
    ].join(" "),
  );
}

/** One 8s take looped in Remotion; audio comes from source/TTS. */
export function buildLucaIdleLoopVideoPrompt(parts: {
  background: string;
  action: string;
  continuityLock: string;
  setPlateTag?: string;
}): string {
  const setRef = parts.setPlateTag ?? "@image4";
  return ensureNoBurnedGraphicsInPrompt(
    [
      `Luca as ${LUCA_IMAGE_TAGS}, facing camera, medium close-up, static tripod, do not change seated vs standing.`,
      `${setRef} is a photograph of the EXACT room/shelf/lighting to replicate — match it, do not redesign.`,
      `VISUAL LOCK: ${parts.continuityLock}`,
      `Environment: ${parts.background}.`,
      `Motion: ${parts.action}. Mouth closed, calm presenter idle: subtle breathing, small nods, minimal hand movement — NOT speaking.`,
      "Same outfit as @image1 @image2 @image3 for entire clip. No scene change.",
    ].join(" "),
  );
}

export function buildLucaSilentTutorVideoPrompt(): string {
  return ensureNoBurnedGraphicsInPrompt(
    [
      `Luca as ${LUCA_IMAGE_TAGS}, friendly language tutor seated at a desk facing camera,`,
      "warm expression, subtle encouraging nods, mouth closed not speaking,",
      "stable tripod shot, soft bright lighting, clean minimal background.",
    ].join(" "),
  );
}

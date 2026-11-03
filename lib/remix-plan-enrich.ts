import { buildLucaSilentTutorVideoPrompt } from "@/lib/ai-video-prompt";
import type { RecreatabilityAnalysis } from "@/lib/recreatability";
import {
  REMIX_CLIP_MAX_SEC,
  REMIX_MAX_DURATION_SEC,
  type RemixClipSpec,
  type RemixSpec,
  type RemixTextOverlaySpec,
  type RemixVoSpec,
} from "@/lib/remix-spec";

const TUTOR_VIDEO_PROMPT = buildLucaSilentTutorVideoPrompt();

function roundSec(n: number): number {
  return Math.round(n * 100) / 100;
}

function isMetaVoText(text: string): boolean {
  const t = text.trim();
  if (t.length > 40) return true;
  return /systematically|on[- ]screen|pronounces each|highlighting|as she says|as he says|the woman|the man|speaker|narrator|displayed on screen|language tutor explains/i.test(
    t,
  );
}

function isShortLessonToken(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 8 && !/\s{2,}/.test(t);
}

function collectLessonTokens(
  analysis: RecreatabilityAnalysis,
  spec: RemixSpec,
): string[] {
  const fromAnalysis = analysis.onScreenText
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (fromAnalysis.length >= 2) {
    return fromAnalysis.slice(0, 20);
  }

  const fromOverlays = spec.textOverlays
    .map((o) => o.text.trim())
    .filter((t) => isShortLessonToken(t));
  if (fromOverlays.length >= 2) {
    return fromOverlays.slice(0, 20);
  }

  return [];
}

function isTimedTextLessonFormat(
  analysis: RecreatabilityAnalysis,
  tokens: string[],
): boolean {
  if (tokens.length < 2) return false;
  if (analysis.dimensions.textOverlays >= 55) return true;
  const hook = `${analysis.hook} ${analysis.summary}`.toLowerCase();
  if (
    /character|alphabet|syllable|hangul|korean|letter|pronounc|highlight/.test(
      hook,
    )
  ) {
    return true;
  }
  return tokens.every(isShortLessonToken);
}

function buildLessonTimeline(tokens: string[]): {
  durationSec: number;
  textOverlays: RemixTextOverlaySpec[];
  audio: RemixVoSpec[];
} {
  const n = tokens.length;
  const durationSec = Math.min(
    REMIX_MAX_DURATION_SEC,
    Math.max(6, Math.ceil(n * 0.48 + 0.85)),
  );
  const leadIn = 0.35;
  const tail = 0.25;
  const slot = (durationSec - leadIn - tail) / n;

  const textOverlays: RemixTextOverlaySpec[] = tokens.map((text, i) => ({
    text,
    startSec: roundSec(leadIn + i * slot),
    endSec: roundSec(leadIn + (i + 1) * slot - 0.02),
    position: "center",
    emphasis: true,
  }));

  const audio: RemixVoSpec[] = tokens.map((text, i) => ({
    type: "vo",
    text,
    startSec: textOverlays[i].startSec,
  }));

  return { durationSec, textOverlays, audio };
}

function clipDurationForOutput(durationSec: number): number {
  return Math.min(REMIX_CLIP_MAX_SEC, Math.max(4, Math.ceil(durationSec)));
}

/** Align OpenRouter plan with analysis for timed text + spoken-beat formats. */
export function enrichRemixSpecFromAnalysis(
  analysis: RecreatabilityAnalysis,
  spec: RemixSpec,
): RemixSpec {
  const tokens = collectLessonTokens(analysis, spec);

  if (isTimedTextLessonFormat(analysis, tokens)) {
    const { durationSec, textOverlays, audio } = buildLessonTimeline(tokens);
    const clips: RemixClipSpec[] = [
      {
        type: "ai-video",
        prompt: TUTOR_VIDEO_PROMPT,
        durationSec: clipDurationForOutput(durationSec),
      },
    ];

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
      lessonCharacters: tokens,
      displayMode: "character-strip",
    };
  }

  let audio = spec.audio;
  if (audio.length === 1 && isMetaVoText(audio[0].text)) {
    audio = [];
  }

  if (audio.length === 0 && tokens.length >= 2) {
    const { durationSec, textOverlays, audio: lessonAudio } =
      buildLessonTimeline(tokens);
    return {
      ...spec,
      clips: spec.clips.map((c, i) =>
        i === 0 ? { ...c, prompt: TUTOR_VIDEO_PROMPT } : c,
      ),
      textOverlays,
      audio: lessonAudio,
      output: { ...spec.output, durationSec },
      lessonCharacters: tokens,
      displayMode: "character-strip",
    };
  }

  return {
    ...spec,
    clips: spec.clips.map((c, i) =>
      i === 0 && !c.prompt.includes("@image1")
        ? { ...c, prompt: TUTOR_VIDEO_PROMPT }
        : c,
    ),
  };
}

import { openRouterChatJson } from "@/lib/openrouter-chat";
import { enrichRemixSpecFromAnalysis } from "@/lib/remix-plan-enrich";
import { parseRemixSpec, type RemixSpec } from "@/lib/remix-spec";
import type { RecreatabilityAnalysis } from "@/lib/recreatability";
import { CHARACTERS } from "@/lib/characters";

export const REMIX_PLAN_SYSTEM_PROMPT = `You write a Remotion edit plan JSON for Viral Remix — a simplified AI remake of a short-form video format.

House model: Luca (male). Reference images are tagged @image1 profile, @image2 face, @image3 turnaround in video prompts.

Rules:
- Remake the FORMAT from the analysis, not a pixel-perfect clone.
- Honor canDrop: never plan lip-sync, on-camera speech, pointing, or other dropped complexity.
- Lean on remakesWell; avoid remakesPoorly unless unavoidable.
- 1–2 clips only, each type "ai-video", durationSec integer 4–8, total clip time ≤ 15 seconds.
- Video prompts: Luca as @image1 @image2 @image3 — set + motion only. NEVER ask the AI clip for text, captions, logos, pills, or UI (all graphics are Remotion textOverlays in post). Default: minimal motion, stable camera, mouth closed unless a separate speaking pipeline is used.
- textOverlays: ALL visible typography/graphics in the remake (hook, onScreenText, beats, header pills, yellow captions). startSec/endSec within output durationSec.
- audio: VO tracks { type: "vo", text, startSec } — one entry per spoken beat. NEVER paste speechSummary or meta-description as VO; spoken text must be the actual words/syllables (e.g. each onScreenText item). For timed character lessons, text should be the character itself.
- Timed text lessons: copy onScreenText into textOverlays with matching startSec/endSec; sync audio to each character; set displayMode "character-strip" and lessonCharacters to the ordered list.
- characterId must be "luca".
- output: width 1080, height 1920, fps 30, durationSec = timeline length (≤ 15).

Return ONLY valid JSON (no markdown):
{
  "characterId": "luca",
  "clips": [{ "type": "ai-video", "prompt": string, "durationSec": number }],
  "textOverlays": [{ "text": string, "startSec": number, "endSec": number, "position": "top" | "center" | "bottom" }],
  "audio": [{ "type": "vo", "text": string, "startSec": number }],
  "output": { "width": 1080, "height": 1920, "fps": 30, "durationSec": number },
  "lessonCharacters": string[] (optional),
  "displayMode": "character-strip" | "default" (optional)
}`;

function buildUserPrompt(analysis: RecreatabilityAnalysis): string {
  const luca = CHARACTERS[0];
  return `Create a remix edit plan for this recreatability analysis (JSON):

${JSON.stringify(analysis, null, 2)}

Character name for prompts: ${luca.name}. Always reference @image1 @image2 @image3 for his appearance.`;
}

export async function planRemixSpec(
  analysis: RecreatabilityAnalysis,
): Promise<
  | { ok: true; spec: RemixSpec }
  | { ok: false; error: string }
> {
  const chat = await openRouterChatJson(
    REMIX_PLAN_SYSTEM_PROMPT,
    buildUserPrompt(analysis),
  );
  if (!chat.ok) {
    return { ok: false, error: chat.error };
  }

  const spec = parseRemixSpec(chat.rawText);
  if (!spec) {
    return { ok: false, error: "Invalid remix plan JSON from model." };
  }

  const enriched = enrichRemixSpecFromAnalysis(analysis, spec);
  return { ok: true, spec: enriched };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecreatabilityAnalysis } from "@/lib/recreatability";
import { enrichRemixSpecFromAnalysis } from "@/lib/remix-plan-enrich";
import type { RemixSpec } from "@/lib/remix-spec";

const baseAnalysis: RecreatabilityAnalysis = {
  overallScore: 85,
  band: "high",
  dimensions: {
    durationFit: 80,
    subjectMotion: 70,
    cameraMotion: 90,
    speechLipSync: 40,
    sceneComplexity: 85,
    textOverlays: 90,
    identity: 75,
    audioSync: 70,
  },
  hook: "Korean alphabet characters highlight in green as each is pronounced",
  beats: [],
  onScreenText: ["가", "나", "다", "라", "마"],
  speechSummary: "The woman systematically pronounces each Korean character.",
  remakesWell: ["timed text", "highlights"],
  remakesPoorly: [],
  canDrop: ["lip-sync"],
  summary: "Language lesson format",
};

const badSpec: RemixSpec = {
  characterId: "luca",
  clips: [
    {
      type: "ai-video",
      prompt: "Luca sitting",
      durationSec: 8,
    },
  ],
  textOverlays: [],
  audio: [
    {
      type: "vo",
      text: baseAnalysis.speechSummary,
      startSec: 0,
    },
  ],
  output: { width: 1080, height: 1920, fps: 30, durationSec: 8 },
};

describe("enrichRemixSpecFromAnalysis", () => {
  it("builds character strip with per-syllable TTS", () => {
    const spec = enrichRemixSpecFromAnalysis(baseAnalysis, badSpec);
    assert.equal(spec.displayMode, "character-strip");
    assert.equal(spec.audio.length, 5);
    assert.equal(spec.audio[0].text, "가");
    assert.notEqual(spec.audio[0].text, baseAnalysis.speechSummary);
    assert.equal(spec.lessonCharacters?.length, 5);
    assert.ok(spec.output.durationSec <= 8);
  });
});

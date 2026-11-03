import type { SegmentRemakePlan } from "@/lib/segment-analyze";

export function buildPresenterPoseLock(plan: SegmentRemakePlan): string {
  const pose = (plan.presenterPose ?? "").trim().toLowerCase();
  if (pose === "seated" || pose === "sitting") {
    return "Luca is SEATED on a chair (waist-up framing), same as the original presenter — NEVER standing, NEVER walking.";
  }
  if (pose === "standing") {
    return "Luca STANDING, same as the original presenter — do not sit.";
  }
  return "Luca keeps the SAME body posture as the original clip throughout (match seated if the source presenter is seated).";
}

/** One frozen paragraph reused verbatim on every chained EvoLink clip. */
export function buildVisualContinuityLock(plan: SegmentRemakePlan): string {
  const poseLock = buildPresenterPoseLock(plan);
  const fromPlan = (plan.visualContinuityLock ?? "").trim();
  const planWithoutStand =
    fromPlan && /stands?/i.test(fromPlan) && /seated|sitting/i.test(poseLock)
      ? fromPlan.replace(/\bstands?\b/gi, "sits")
      : fromPlan;

  const bg = (plan.backgroundDescription ?? "").trim();
  const parts = [
    poseLock,
    "Luca wears the EXACT same clothes as reference photos @image1 @image2 @image3 (same shirt color, fit, hair, skin).",
    "Fixed tripod medium close-up; identical framing, focal length, and headroom every clip.",
    "Same room forever: same wall color, same shelf/props, same LED accent colors, same shadows — zero set drift.",
    planWithoutStand || (bg ? `Set details to preserve: ${bg}` : ""),
  ].filter(Boolean);
  return parts.join(" ");
}

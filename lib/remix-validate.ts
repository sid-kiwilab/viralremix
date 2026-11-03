import {
  parseRecreatabilityAnalysis,
  type RecreatabilityAnalysis,
} from "@/lib/recreatability";
import { parseRemixSpec, type RemixSpec } from "@/lib/remix-spec";

export function parseAnalysisBody(body: unknown): RecreatabilityAnalysis | null {
  if (!body || typeof body !== "object") return null;
  return parseRecreatabilityAnalysis(JSON.stringify(body));
}

export function parseRemixSpecBody(body: unknown): RemixSpec | null {
  if (!body || typeof body !== "object") return null;
  return parseRemixSpec(JSON.stringify(body));
}

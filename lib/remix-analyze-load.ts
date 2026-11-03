import { neon } from "@neondatabase/serverless";
import {
  PROMPT_VERSION,
  parseRecreatabilityAnalysis,
  type RecreatabilityAnalysis,
} from "@/lib/recreatability";
import { REMIX_MIN_SCORE } from "@/lib/remix-spec";

export type LoadedAnalyzeRun = {
  analysis: RecreatabilityAnalysis;
  overallScore: number;
  durationSec: number | null;
  sourceUrl: string | null;
};

function unwrapAnalysisPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.hook === "string" && typeof obj.overallScore === "number") {
    return raw;
  }
  if (obj.result && typeof obj.result === "object") {
    return obj.result;
  }
  return raw;
}

export function parseAnalysisJson(raw: unknown): RecreatabilityAnalysis | null {
  const payload = unwrapAnalysisPayload(raw);
  if (!payload || typeof payload !== "object") return null;
  return parseRecreatabilityAnalysis(JSON.stringify(payload));
}

export async function loadLatestEligibleAnalyzeRun(): Promise<LoadedAnalyzeRun | null> {
  const connectionString = (process.env.NEON_CONNECTION_STRING ?? "").trim();
  if (!connectionString) {
    throw new Error("Missing NEON_CONNECTION_STRING.");
  }

  const sql = neon(connectionString);
  const rows = await sql`
    SELECT result, overall_score, duration_sec, source_url
    FROM analyze_runs
    WHERE ok = true
      AND prompt_version = ${PROMPT_VERSION}
      AND overall_score >= ${REMIX_MIN_SCORE}
      AND result IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const row = rows[0] as
    | {
        result: unknown;
        overall_score: number | null;
        duration_sec: number | null;
        source_url: string | null;
      }
    | undefined;

  if (!row?.result) return null;

  const analysis = parseAnalysisJson(row.result);
  if (!analysis) return null;

  return {
    analysis,
    overallScore: row.overall_score ?? analysis.overallScore,
    durationSec: row.duration_sec,
    sourceUrl: row.source_url,
  };
}

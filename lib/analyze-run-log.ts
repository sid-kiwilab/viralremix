import { after } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  PROMPT_VERSION,
  RECREATABILITY_SYSTEM_PROMPT,
  type RecreatabilityAnalysis,
  type RecreatabilityBand,
} from "@/lib/recreatability";

export type AnalyzeRunLogRow = {
  ok: boolean;
  platform: "instagram" | "tiktok" | null;
  sourceUrl: string | null;
  title: string | null;
  videoBytes: number;
  durationSec: number | null;
  promptUser: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  overallScore: number | null;
  band: RecreatabilityBand | null;
  result: RecreatabilityAnalysis | null;
  userError: string | null;
  rawError: string | null;
  status: number;
};

const MAX_ERROR_CHARS = 4000;

let tableReady: Promise<void> | null = null;

function truncate(value: string): string {
  const text = value.trim();
  if (text.length <= MAX_ERROR_CHARS) return text;
  return `${text.slice(0, MAX_ERROR_CHARS)}…`;
}

async function writeAnalyzeRun(row: AnalyzeRunLogRow) {
  const connectionString = (process.env.NEON_CONNECTION_STRING ?? "").trim();
  if (!connectionString) return;

  const sql = neon(connectionString);
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS analyze_runs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        prompt_version integer NOT NULL,
        prompt_system text NOT NULL,
        prompt_user text NOT NULL,
        model text NOT NULL,
        ok boolean NOT NULL,
        overall_score integer,
        band text,
        result jsonb,
        user_error text,
        raw_error text,
        platform text,
        source_url text,
        title text,
        video_bytes bigint NOT NULL,
        duration_sec double precision,
        latency_ms integer NOT NULL,
        input_tokens integer,
        output_tokens integer,
        status integer NOT NULL
      )
    `.then(() => undefined);
  }

  const resultJson = row.result ? JSON.stringify(row.result) : null;

  try {
    await tableReady;
    await sql`
      INSERT INTO analyze_runs (
        prompt_version,
        prompt_system,
        prompt_user,
        model,
        ok,
        overall_score,
        band,
        result,
        user_error,
        raw_error,
        platform,
        source_url,
        title,
        video_bytes,
        duration_sec,
        latency_ms,
        input_tokens,
        output_tokens,
        status
      )
      VALUES (
        ${PROMPT_VERSION},
        ${RECREATABILITY_SYSTEM_PROMPT},
        ${row.promptUser},
        ${row.model},
        ${row.ok},
        ${row.overallScore},
        ${row.band},
        ${resultJson},
        ${row.userError},
        ${row.rawError ? truncate(row.rawError) : null},
        ${row.platform},
        ${row.sourceUrl},
        ${row.title},
        ${row.videoBytes},
        ${row.durationSec},
        ${row.latencyMs},
        ${row.inputTokens},
        ${row.outputTokens},
        ${row.status}
      )
    `;
  } catch {
    tableReady = null;
  }
}

export function scheduleAnalyzeRunLog(row: AnalyzeRunLogRow) {
  after(() => {
    void writeAnalyzeRun(row);
  });
}

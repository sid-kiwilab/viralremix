import { after } from "next/server";
import { neon } from "@neondatabase/serverless";

export type IngestErrorRow = {
  platform: "instagram" | "tiktok";
  contentId: string;
  url: string;
  rawError: string;
  userError: string;
  status: number;
};

const MAX_ERROR_CHARS = 4000;

let tableReady: Promise<void> | null = null;

function truncate(value: string): string {
  const text = value.trim();
  if (text.length <= MAX_ERROR_CHARS) return text;
  return `${text.slice(0, MAX_ERROR_CHARS)}…`;
}

async function writeIngestError(row: IngestErrorRow) {
  const connectionString = (process.env.NEON_CONNECTION_STRING ?? "").trim();
  if (!connectionString) return;

  const sql = neon(connectionString);
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS ingest_errors (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        platform text NOT NULL,
        content_id text NOT NULL,
        url text NOT NULL,
        raw_error text NOT NULL,
        user_error text NOT NULL,
        status integer NOT NULL
      )
    `.then(() => undefined);
  }

  try {
    await tableReady;
    await sql`
      INSERT INTO ingest_errors (platform, content_id, url, raw_error, user_error, status)
      VALUES (
        ${row.platform},
        ${row.contentId},
        ${row.url},
        ${truncate(row.rawError)},
        ${truncate(row.userError)},
        ${row.status}
      )
    `;
  } catch {
    tableReady = null;
  }
}

export function scheduleIngestErrorLog(row: IngestErrorRow) {
  after(() => {
    void writeIngestError(row);
  });
}

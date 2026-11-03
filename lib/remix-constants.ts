export type RemixJobStatus =
  | "queued"
  | "generating"
  | "rendering"
  | "done"
  | "failed";

/** Client poll interval for remix render jobs (ms). */
export const REMIX_RENDER_POLL_MS = 2000;

/** Client gives up polling after this (ms). EvoLink + Remotion can be slow. */
export const REMIX_RENDER_CLIENT_TIMEOUT_MS = 12 * 60 * 1000;

/** OpenRouter plan step timeout (ms). */
export const REMIX_PLAN_FETCH_TIMEOUT_MS = 60_000;

/** EvoLink Seedance ref-to-video billing knobs (see .env.example). */

export type EvoLinkVideoQuality = "720p" | "1080p";

const MIN_BILLABLE_SEC = 4;
const MAX_BILLABLE_SEC = 8;

export function getEvoLinkVideoQuality(): EvoLinkVideoQuality {
  const q = (process.env.EVOLINK_VIDEO_QUALITY ?? "720p").trim().toLowerCase();
  return q === "1080p" ? "1080p" : "720p";
}

/** Seconds sent to EvoLink API (shorter = cheaper; Remotion can loop the clip). */
export function getEvoLinkBillableDurationSec(plannedSec: number): number {
  const cap = parseInt(process.env.EVOLINK_VIDEO_MAX_SEC ?? "5", 10);
  const maxSec = Number.isFinite(cap)
    ? Math.min(MAX_BILLABLE_SEC, Math.max(MIN_BILLABLE_SEC, cap))
    : 5;
  const planned = Number.isFinite(plannedSec)
    ? Math.round(plannedSec)
    : MIN_BILLABLE_SEC;
  return Math.min(maxSec, Math.max(MIN_BILLABLE_SEC, planned));
}

/** Timeline length for Remotion + trimmed reference segment (may be shorter than --sec). */
export function getRecreateTrimTailSec(requestedSec: number): number {
  const raw = (process.env.RECREATE_TRIM_TAIL_SEC ?? "").trim();
  if (raw !== "") {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return requestedSec >= 16 ? 1 : 0;
}

export function getRecreateOutputDurationSec(requestedSec: number): number {
  const tail = getRecreateTrimTailSec(requestedSec);
  return Math.max(3, requestedSec - tail);
}

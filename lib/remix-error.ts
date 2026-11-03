export const GENERIC_REMIX_ERROR =
  "Could not complete remix. Try again in a moment.";

export const REMIX_PLAN_TIMEOUT_ERROR = "Planning took too long. Try again.";

export const REMIX_SCORE_TOO_LOW =
  "Score is too low to remake honestly with today’s tools.";

export const REMIX_RENDER_TIMEOUT_ERROR = "Render took too long. Try again.";

export const REMIX_LUCA_REFS_UNREACHABLE =
  "Luca reference photos are not reachable by EvoLink. Push public/avatars/luca/*.jpg to GitHub main or set REMIX_LUCA_REF_BASE in .env to a public URL base.";

export function userFacingRemixError(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return GENERIC_REMIX_ERROR;
  if (text === REMIX_PLAN_TIMEOUT_ERROR) return text;
  if (text === REMIX_SCORE_TOO_LOW) return text;
  if (text === REMIX_RENDER_TIMEOUT_ERROR) return text;
  if (/^Render took too long/i.test(text)) return REMIX_RENDER_TIMEOUT_ERROR;
  if (/score is too low|too low to remake/i.test(text)) return REMIX_SCORE_TOO_LOW;
  if (/input media URL could not be fetched|media URL could not be fetched/i.test(text)) {
    return REMIX_LUCA_REFS_UNREACHABLE;
  }
  if (/missing EVOLINK|missing OPENROUTER|not configured/i.test(text)) {
    return "Remix is not configured on the server.";
  }
  if (
    /openrouter|evolink|api[_ ]?key|authorization|rate limit|429|502|503|504|fetch failed|timeout|ECONNREFUSED|invalid remix plan|invalid spec/i.test(
      text,
    )
  ) {
    return GENERIC_REMIX_ERROR;
  }
  return GENERIC_REMIX_ERROR;
}

export const GENERIC_ANALYZE_ERROR =
  "Could not analyze this video. Try again in a moment.";

export const ANALYZE_TIMEOUT_ERROR =
  "Analysis took too long. Try again.";

/** User-safe message; raw upstream text stays server-side only. */
export function userFacingAnalyzeError(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return GENERIC_ANALYZE_ERROR;

  if (text === ANALYZE_TIMEOUT_ERROR) return text;

  if (
    /^Video is too large for analysis|^Missing video file|^Unsupported video type|^Invalid form data|^Analysis is not configured on the server/i.test(
      text,
    )
  ) {
    return text;
  }

  if (
    /openrouter|OPENROUTER|api[_ ]?key|authorization|bearer|invalid.*json|provider|gemini|google\/|rate limit|429|502|503|504|ECONNREFUSED|fetch failed|unexpected token|syntax error|abort|timeout|exceeded|payload|base64|multipart|curl|yt-dlp|python|node:|stack|TypeError|ReferenceError/i.test(
      text,
    )
  ) {
    return GENERIC_ANALYZE_ERROR;
  }

  const cleaned = text.replace(/^ERROR:\s*/i, "").trim();
  if (!cleaned || cleaned.length > 200) {
    return GENERIC_ANALYZE_ERROR;
  }

  return GENERIC_ANALYZE_ERROR;
}

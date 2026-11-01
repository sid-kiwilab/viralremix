import { NextResponse } from "next/server";
import {
  ANALYZE_TIMEOUT_ERROR,
  userFacingAnalyzeError,
} from "@/lib/analyze-error";
import { ANALYZE_FETCH_TIMEOUT_MS, ANALYZE_MAX_VIDEO_BYTES } from "@/lib/analyze-constants";
import {
  scheduleAnalyzeRunLog,
  type AnalyzeRunLogRow,
} from "@/lib/analyze-run-log";
import {
  analyzeVideoRecreatability,
  getConfiguredOpenRouterVideoModel,
} from "@/lib/openrouter";

export const maxDuration = 120;

function analyzeUpstreamSignal(clientSignal: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ANALYZE_FETCH_TIMEOUT_MS);
  if (clientSignal.aborted) return clientSignal;
  return AbortSignal.any([clientSignal, timeout]);
}

function isClientAbort(err: unknown, clientSignal: AbortSignal): boolean {
  return clientSignal.aborted;
}

function isAnalyzeUpstreamTimeout(
  err: unknown,
  clientSignal: AbortSignal,
): boolean {
  if (clientSignal.aborted) return false;
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

const ALLOWED_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type AnalyzeRequestContext = Pick<
  AnalyzeRunLogRow,
  "platform" | "sourceUrl" | "title" | "durationSec" | "videoBytes"
>;

function parsePlatform(value: FormDataEntryValue | null): "instagram" | "tiktok" | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "instagram" || trimmed === "tiktok") return trimmed;
  return null;
}

function parseOptionalString(value: FormDataEntryValue | null, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function parseDurationSec(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value.trim());
  if (!Number.isFinite(n) || n <= 0 || n > 86_400) return null;
  return n;
}

function parseRequestContext(formData: FormData, videoBytes: number): AnalyzeRequestContext {
  return {
    platform: parsePlatform(formData.get("platform")),
    sourceUrl: parseOptionalString(formData.get("url"), 2048),
    title: parseOptionalString(formData.get("title"), 512),
    durationSec: parseDurationSec(formData.get("durationSec")),
    videoBytes,
  };
}

function logAnalyzeRun(
  ctx: AnalyzeRequestContext,
  patch: Partial<AnalyzeRunLogRow> & Pick<AnalyzeRunLogRow, "ok" | "status">,
) {
  scheduleAnalyzeRunLog({
    platform: ctx.platform,
    sourceUrl: ctx.sourceUrl,
    title: ctx.title,
    videoBytes: ctx.videoBytes,
    durationSec: ctx.durationSec,
    model: getConfiguredOpenRouterVideoModel(),
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    overallScore: null,
    band: null,
    result: null,
    userError: null,
    rawError: null,
    ...patch,
  });
}

function validationError(
  ctx: AnalyzeRequestContext,
  status: number,
  userError: string,
  rawError: string,
) {
  logAnalyzeRun(ctx, { ok: false, status, userError, rawError });
  return NextResponse.json({ error: userError }, { status });
}

export async function POST(request: Request) {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Analysis is not configured on the server." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("video");
  const videoBytes = file instanceof Blob ? file.size : 0;
  const ctx = parseRequestContext(formData, videoBytes);

  if (!(file instanceof Blob) || file.size === 0) {
    return validationError(ctx, 400, "Missing video file.", "missing video file");
  }

  if (file.size > ANALYZE_MAX_VIDEO_BYTES) {
    const userError = `Video is too large for analysis (max ${Math.round(ANALYZE_MAX_VIDEO_BYTES / (1024 * 1024))} MB).`;
    return validationError(ctx, 413, userError, "video exceeds analyze size cap");
  }

  const mimeType = (file.type || "video/mp4").split(";")[0]?.trim() || "video/mp4";
  if (!ALLOWED_MIME.has(mimeType)) {
    return validationError(
      ctx,
      400,
      "Unsupported video type. Use MP4 from Fetch.",
      `unsupported mime: ${mimeType}`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await analyzeVideoRecreatability(
      buffer,
      mimeType,
      analyzeUpstreamSignal(request.signal),
    );

    if (!result.ok) {
      const status = result.status ?? 502;
      const userError =
        status === 503
          ? "Analysis is not configured on the server."
          : userFacingAnalyzeError(result.error);

      logAnalyzeRun(ctx, {
        ok: false,
        status,
        model: result.meta.model,
        latencyMs: result.meta.latencyMs,
        inputTokens: result.meta.usage?.inputTokens ?? null,
        outputTokens: result.meta.usage?.outputTokens ?? null,
        userError,
        rawError: result.error,
      });

      return NextResponse.json({ error: userError }, { status });
    }

    logAnalyzeRun(ctx, {
      ok: true,
      status: 200,
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
      inputTokens: result.meta.usage?.inputTokens ?? null,
      outputTokens: result.meta.usage?.outputTokens ?? null,
      overallScore: result.analysis.overallScore,
      band: result.analysis.band,
      result: result.analysis,
    });

    return NextResponse.json(result.analysis, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (isClientAbort(err, request.signal)) {
      return new NextResponse(null, { status: 499 });
    }
    if (isAnalyzeUpstreamTimeout(err, request.signal)) {
      logAnalyzeRun(ctx, {
        ok: false,
        status: 504,
        latencyMs: ANALYZE_FETCH_TIMEOUT_MS,
        userError: ANALYZE_TIMEOUT_ERROR,
        rawError: "upstream timeout",
      });
      return NextResponse.json({ error: ANALYZE_TIMEOUT_ERROR }, { status: 504 });
    }
    const raw = err instanceof Error ? err.message : "";
    const userError = userFacingAnalyzeError(raw);
    logAnalyzeRun(ctx, {
      ok: false,
      status: 502,
      userError,
      rawError: raw || "unknown error",
    });
    return NextResponse.json({ error: userError }, { status: 502 });
  }
}

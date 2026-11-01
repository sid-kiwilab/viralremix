import { spawn } from "node:child_process";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { scheduleIngestErrorLog } from "@/lib/ingest-error-log";
import { FETCH_SCRIPT } from "@/lib/video-paths";
import { INGEST_FETCH_TIMEOUT_MS } from "@/lib/ingest-constants";
import {
  parseSupportedVideoUrl,
  videoUrlErrorMessage,
  type ParsedVideoUrl,
} from "@/lib/video-url";

/** Match Cloud Run `--timeout=300` (seconds). */
export const maxDuration = 300;

function ingestUpstreamSignal(clientSignal: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(INGEST_FETCH_TIMEOUT_MS);
  if (clientSignal.aborted) return clientSignal;
  return AbortSignal.any([clientSignal, timeout]);
}

function isClientAbort(err: unknown, clientSignal: AbortSignal): boolean {
  return (
    clientSignal.aborted ||
    (err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

type CloudRunConfig =
  | { mode: "local" }
  | { mode: "cloud"; baseUrl: string; secret: string };

function getCloudRunConfig(): CloudRunConfig {
  const baseUrl = (process.env.CLOUD_RUN_URL ?? "").trim().replace(/\/$/, "");
  if (!baseUrl) return { mode: "local" };
  const secret = (process.env.FETCH_SERVICE_SECRET ?? "").trim();
  if (!secret) {
    return { mode: "cloud", baseUrl, secret: "" };
  }
  return { mode: "cloud", baseUrl, secret };
}

const GENERIC_INGEST_ERROR =
  "Could not download this video. Try a public Instagram Reel or TikTok link.";

type FetchResult =
  | { ok: true; video: Buffer; title: string }
  | { ok: false; rawError: string };

function userFacingIngestError(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return GENERIC_INGEST_ERROR;
  if (
    /deprecated feature|python|yt-dlp|curl_cffi|pip install|invalid script output|download failed \(exit|unauthorized|ECONNREFUSED|fetch failed|FETCH_SERVICE_SECRET is not set/i.test(
      text,
    )
  ) {
    return GENERIC_INGEST_ERROR;
  }
  const cleaned = text.replace(/^ERROR:\s*/i, "").trim();
  if (!cleaned || cleaned.length > 280) {
    return GENERIC_INGEST_ERROR;
  }
  return cleaned;
}

function lastJsonLine(stdout: string): string {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line?.startsWith("{")) return line;
  }
  return "";
}

function failIngest(parsed: ParsedVideoUrl, rawError: string) {
  const userError = userFacingIngestError(rawError);
  scheduleIngestErrorLog({
    platform: parsed.platform,
    contentId: parsed.contentId,
    url: parsed.canonicalUrl,
    rawError,
    userError,
    status: 502,
  });
  return NextResponse.json({ error: userError }, { status: 502 });
}

async function fetchFromCloudRun(
  url: string,
  baseUrl: string,
  secret: string,
  clientSignal: AbortSignal,
): Promise<FetchResult> {
  const response = await fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ url }),
    signal: ingestUpstreamSignal(clientSignal),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { error?: string };
    return {
      ok: false,
      rawError: data.error || `Cloud Run ingest failed (${response.status})`,
    };
  }

  if (!response.ok) {
    return { ok: false, rawError: `Cloud Run ingest failed (${response.status})` };
  }

  const video = Buffer.from(await response.arrayBuffer());
  if (video.length === 0) {
    return { ok: false, rawError: "Cloud Run returned an empty video" };
  }

  const titleHeader = response.headers.get("X-Video-Title");
  const title = titleHeader ? decodeURIComponent(titleHeader) : "";
  return { ok: true, video, title };
}

function runFetchScript(
  url: string,
  outFile: string,
  workDir: string,
  clientSignal: AbortSignal,
): Promise<{ ok: boolean; meta?: Record<string, unknown>; rawError?: string }> {
  return new Promise((resolve) => {
    const py =
      process.platform === "win32"
        ? process.env.PYTHON_PATH || "python"
        : process.env.PYTHON_PATH || "python3";

    const child = spawn(
      /* turbopackIgnore: true */ py,
      [FETCH_SCRIPT, "--url", url, "--out", outFile, "--work", workDir],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, INGEST_FETCH_TIMEOUT_MS);

    const onClientAbort = () => {
      clearTimeout(timer);
      child.kill("SIGTERM");
    };
    clientSignal.addEventListener("abort", onClientAbort, { once: true });

    child.on("close", (code) => {
      clearTimeout(timer);
      clientSignal.removeEventListener("abort", onClientAbort);
      const line = lastJsonLine(stdout);
      try {
        const parsed = JSON.parse(line) as {
          ok: boolean;
          meta?: Record<string, unknown>;
          error?: string;
        };
        if (!parsed.ok) {
          resolve({
            ok: false,
            rawError: parsed.error || stderr || `exit ${code}`,
          });
          return;
        }
        resolve({ ok: true, meta: parsed.meta });
        return;
      } catch {
        resolve({
          ok: false,
          rawError: stderr || (code !== 0 ? `exit ${code}` : "invalid script output"),
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      clientSignal.removeEventListener("abort", onClientAbort);
      resolve({
        ok: false,
        rawError: err.message || "Failed to start Python fetch script",
      });
    });
  });
}

async function cleanupTemp(outFile: string, workDir: string) {
  await fsPromises.rm(outFile, { force: true }).catch(() => {});
  await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function fetchLocal(
  url: string,
  clientSignal: AbortSignal,
): Promise<FetchResult> {
  const stamp = randomUUID();
  const outFile = path.join(os.tmpdir(), "viralremix", `${stamp}.mp4`);
  const workDir = path.join(os.tmpdir(), "viralremix", `${stamp}_work`);
  await fsPromises.mkdir(path.dirname(outFile), { recursive: true });

  const result = await runFetchScript(url, outFile, workDir, clientSignal);
  if (!result.ok) {
    await cleanupTemp(outFile, workDir);
    return { ok: false, rawError: result.rawError || GENERIC_INGEST_ERROR };
  }

  let video: Buffer;
  try {
    video = await fsPromises.readFile(outFile);
  } catch (err) {
    await cleanupTemp(outFile, workDir);
    return {
      ok: false,
      rawError: err instanceof Error ? err.message : "Could not read downloaded file",
    };
  }

  await cleanupTemp(outFile, workDir);

  if (video.length === 0) {
    return { ok: false, rawError: "Download finished but no file was found" };
  }

  const title = (result.meta?.title as string | undefined) ?? "";
  return { ok: true, video, title };
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url : "";
  const parsed = parseSupportedVideoUrl(rawUrl);
  if (!parsed) {
    return NextResponse.json({ error: videoUrlErrorMessage() }, { status: 400 });
  }

  const cloudRun = getCloudRunConfig();
  if (cloudRun.mode === "cloud" && !cloudRun.secret) {
    return failIngest(parsed, "FETCH_SERVICE_SECRET is not set");
  }

  try {
    const result =
      cloudRun.mode === "cloud"
        ? await fetchFromCloudRun(
            parsed.canonicalUrl,
            cloudRun.baseUrl,
            cloudRun.secret,
            request.signal,
          )
        : await fetchLocal(parsed.canonicalUrl, request.signal);

    if (!result.ok) {
      return failIngest(parsed, result.rawError);
    }

    return new NextResponse(new Uint8Array(result.video), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(result.video.length),
        "Cache-Control": "no-store",
        "X-Video-Platform": parsed.platform,
        "X-Video-Content-Id": parsed.contentId,
        ...(result.title
          ? { "X-Video-Title": encodeURIComponent(result.title) }
          : {}),
      },
    });
  } catch (err) {
    if (isClientAbort(err, request.signal)) {
      return new NextResponse(null, { status: 499 });
    }
    const rawError =
      err instanceof Error ? err.message : "Cloud Run ingest failed";
    return failIngest(parsed, rawError);
  }
}

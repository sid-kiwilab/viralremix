"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RecreatabilityCard } from "@/components/recreatability-card";
import { RemixPlanCard } from "@/components/remix-plan-card";
import { SiteShell } from "@/components/site-shell";
import { ANALYZE_FETCH_TIMEOUT_MS } from "@/lib/analyze-constants";
import { INGEST_FETCH_TIMEOUT_MS } from "@/lib/ingest-constants";
import {
  REMIX_PLAN_FETCH_TIMEOUT_MS,
  REMIX_RENDER_CLIENT_TIMEOUT_MS,
  REMIX_RENDER_POLL_MS,
} from "@/lib/remix-constants";
import type { RecreatabilityAnalysis } from "@/lib/recreatability";
import type { RemixJobStatus } from "@/lib/remix-constants";
import { userFacingRemixError } from "@/lib/remix-error";
import { REMIX_MIN_SCORE, type RemixSpec } from "@/lib/remix-spec";

type PreviewState = {
  platform: "instagram" | "tiktok";
  title: string | null;
  playbackUrl: string;
};

type AnalyzeContext = {
  url: string;
  platform: "instagram" | "tiktok";
  title: string | null;
};

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RecreatabilityAnalysis | null>(
    null,
  );
  const [analyzeBlobReady, setAnalyzeBlobReady] = useState(false);
  const [analyzePending, setAnalyzePending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const videoBlobRef = useRef<Blob | null>(null);
  const analyzeContextRef = useRef<AnalyzeContext | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const pendingAnalyzeBlobRef = useRef<Blob | null>(null);
  const analyzeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [remixSpec, setRemixSpec] = useState<RemixSpec | null>(null);
  const [remixPlanLoading, setRemixPlanLoading] = useState(false);
  const [remixPlanError, setRemixPlanError] = useState<string | null>(null);
  const [remixJobId, setRemixJobId] = useState<string | null>(null);
  const [remixJobStatus, setRemixJobStatus] = useState<RemixJobStatus | null>(
    null,
  );
  const [remixRenderError, setRemixRenderError] = useState<string | null>(null);
  const [remixVideoUrl, setRemixVideoUrl] = useState<string | null>(null);
  const remixPlanAbortRef = useRef<AbortController | null>(null);
  const remixPollAbortRef = useRef<AbortController | null>(null);

  function clearRemixState() {
    remixPlanAbortRef.current?.abort();
    remixPlanAbortRef.current = null;
    remixPollAbortRef.current?.abort();
    remixPollAbortRef.current = null;
    setRemixSpec(null);
    setRemixPlanLoading(false);
    setRemixPlanError(null);
    setRemixJobId(null);
    setRemixJobStatus(null);
    setRemixRenderError(null);
    setRemixVideoUrl(null);
  }

  function clearAnalyzeFallbackTimer() {
    if (analyzeFallbackTimerRef.current !== null) {
      clearTimeout(analyzeFallbackTimerRef.current);
      analyzeFallbackTimerRef.current = null;
    }
  }

  function clearPreview() {
    clearAnalyzeFallbackTimer();
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    videoBlobRef.current = null;
    analyzeContextRef.current = null;
    pendingAnalyzeBlobRef.current = null;
    setAnalyzeBlobReady(false);
    setAnalyzePending(false);
    setPreview(null);
    setAnalysis(null);
    setAnalyzeError(null);
    setAnalyzeLoading(false);
    clearRemixState();
  }

  function cancelAnalyze() {
    if (analyzePending) {
      clearAnalyzeFallbackTimer();
      pendingAnalyzeBlobRef.current = null;
      setAnalyzePending(false);
      return;
    }
    if (!analyzeLoading) return;
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setAnalyzeLoading(false);
    setAnalyzeError(null);
  }

  const runAnalyze = useCallback(async (blob: Blob) => {
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    setAnalyzePending(false);
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setAnalysis(null);
    clearRemixState();

    const isActive = () =>
      analyzeAbortRef.current === controller && !controller.signal.aborted;

    const timeoutSignal = AbortSignal.timeout(ANALYZE_FETCH_TIMEOUT_MS);
    const fetchSignal = AbortSignal.any([controller.signal, timeoutSignal]);

    try {
      const formData = new FormData();
      formData.append("video", blob, "video.mp4");

      const ctx = analyzeContextRef.current;
      if (ctx) {
        formData.append("url", ctx.url);
        formData.append("platform", ctx.platform);
        if (ctx.title) formData.append("title", ctx.title);
      }

      const duration = videoPlayerRef.current?.duration;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        formData.append("durationSec", String(duration));
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: fetchSignal,
      });

      if (!isActive()) return;

      if (response.status === 499) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!isActive()) return;
        setAnalyzeError(data.error ?? "Could not analyze this video.");
        return;
      }

      const data = (await response.json()) as RecreatabilityAnalysis;
      if (!isActive()) return;
      setAnalysis(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!isActive()) return;
        if (controller.signal.aborted) return;
        if (timeoutSignal.aborted) {
          setAnalyzeError("Analysis took too long. Try fetching again.");
        }
        return;
      }
      if (!isActive()) return;
      setAnalyzeError("Could not analyze this video. Try again.");
    } finally {
      if (analyzeAbortRef.current === controller) {
        setAnalyzeLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAnalyzeFallbackTimer();
      abortRef.current?.abort();
      analyzeAbortRef.current?.abort();
      remixPlanAbortRef.current?.abort();
      remixPollAbortRef.current?.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    clearPreview();

    const isActive = () =>
      abortRef.current === controller && !controller.signal.aborted;

    const timeoutSignal = AbortSignal.timeout(INGEST_FETCH_TIMEOUT_MS);
    const fetchSignal = AbortSignal.any([controller.signal, timeoutSignal]);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl }),
        signal: fetchSignal,
      });

      if (!isActive()) return;

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = (await response.json()) as { error?: string };
        if (!isActive()) return;
        setError(data.error ?? "Could not fetch video.");
        return;
      }

      const blob = await response.blob();
      if (!isActive()) return;

      const objectUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objectUrl;
      videoBlobRef.current = blob;
      setAnalyzeBlobReady(true);

      const platformHeader = response.headers.get("X-Video-Platform");
      const platform =
        platformHeader === "instagram" || platformHeader === "tiktok"
          ? platformHeader
          : "tiktok";

      const titleHeader = response.headers.get("X-Video-Title");
      const title = titleHeader
        ? decodeURIComponent(titleHeader)
        : null;

      analyzeContextRef.current = {
        url: videoUrl.trim(),
        platform,
        title,
      };

      setPreview({
        platform,
        title,
        playbackUrl: objectUrl,
      });

      pendingAnalyzeBlobRef.current = blob;
      setAnalyzePending(true);
      clearAnalyzeFallbackTimer();
      const blobForFallback = blob;
      analyzeFallbackTimerRef.current = setTimeout(() => {
        analyzeFallbackTimerRef.current = null;
        if (pendingAnalyzeBlobRef.current !== blobForFallback) return;
        pendingAnalyzeBlobRef.current = null;
        void runAnalyze(blobForFallback);
      }, 2500);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!isActive()) return;
        if (timeoutSignal.aborted) {
          setError("Fetching took too long. Try again.");
        }
        return;
      }
      if (!isActive()) return;
      setError("Could not fetch video. Try again.");
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  const platformLabel =
    preview?.platform === "instagram" ? "Instagram Reel" : "TikTok";

  const canRetryAnalyze =
    Boolean(
      preview &&
        analyzeBlobReady &&
        !analyzeLoading &&
        !analyzePending &&
        !analysis,
    );

  function retryAnalyze() {
    const blob = videoBlobRef.current;
    if (!blob || analyzeLoading) return;
    clearAnalyzeFallbackTimer();
    pendingAnalyzeBlobRef.current = null;
    void runAnalyze(blob);
  }

  function onVideoMetadataLoaded() {
    clearAnalyzeFallbackTimer();
    const pending = pendingAnalyzeBlobRef.current;
    if (!pending || analyzeLoading) return;
    pendingAnalyzeBlobRef.current = null;
    void runAnalyze(pending);
  }

  function cancelRemixPlan() {
    if (!remixPlanLoading) return;
    remixPlanAbortRef.current?.abort();
    remixPlanAbortRef.current = null;
    setRemixPlanLoading(false);
    setRemixPlanError(null);
  }

  function cancelRemixPoll() {
    remixPollAbortRef.current?.abort();
    remixPollAbortRef.current = null;
    setRemixJobId(null);
    setRemixJobStatus(null);
    setRemixRenderError(null);
  }

  const runRemixPlan = useCallback(async () => {
    if (!analysis || analysis.overallScore < REMIX_MIN_SCORE) return;

    remixPlanAbortRef.current?.abort();
    const controller = new AbortController();
    remixPlanAbortRef.current = controller;

    setRemixPlanLoading(true);
    setRemixPlanError(null);
    setRemixSpec(null);
    setRemixJobId(null);
    setRemixJobStatus(null);
    setRemixRenderError(null);
    setRemixVideoUrl(null);

    const isActive = () =>
      remixPlanAbortRef.current === controller && !controller.signal.aborted;

    const timeoutSignal = AbortSignal.timeout(REMIX_PLAN_FETCH_TIMEOUT_MS);
    const fetchSignal = AbortSignal.any([controller.signal, timeoutSignal]);

    try {
      const response = await fetch("/api/remix/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis),
        signal: fetchSignal,
      });

      if (!isActive()) return;
      if (response.status === 499) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!isActive()) return;
        setRemixPlanError(data.error ?? "Could not build remake plan.");
        return;
      }

      const spec = (await response.json()) as RemixSpec;
      if (!isActive()) return;
      setRemixSpec(spec);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!isActive()) return;
        return;
      }
      if (!isActive()) return;
      setRemixPlanError("Could not build remake plan.");
    } finally {
      if (remixPlanAbortRef.current === controller) {
        setRemixPlanLoading(false);
      }
    }
  }, [analysis]);

  const pollRemixJob = useCallback(async (jobId: string, signal: AbortSignal) => {
    const started = Date.now();
    while (!signal.aborted) {
      if (Date.now() - started > REMIX_RENDER_CLIENT_TIMEOUT_MS) {
        throw new Error("Render took too long. Try again.");
      }

      const response = await fetch(`/api/remix/${jobId}`, { signal });
      if (signal.aborted) return;

      if (!response.ok) {
        throw new Error("Could not read render status.");
      }

      const data = (await response.json()) as {
        status: RemixJobStatus;
        error?: string;
      };
      setRemixJobStatus(data.status);

      if (data.status === "done") {
        setRemixVideoUrl(`/api/remix/${jobId}/video?ts=${Date.now()}`);
        return;
      }
      if (data.status === "failed") {
        throw new Error(userFacingRemixError(data.error));
      }

      await new Promise((resolve) => setTimeout(resolve, REMIX_RENDER_POLL_MS));
    }
  }, []);

  const runRemixRender = useCallback(async () => {
    if (!remixSpec) return;

    remixPollAbortRef.current?.abort();
    const controller = new AbortController();
    remixPollAbortRef.current = controller;

    setRemixRenderError(null);
    setRemixVideoUrl(null);
    setRemixJobId(null);
    setRemixJobStatus(null);

    const isActive = () =>
      remixPollAbortRef.current === controller && !controller.signal.aborted;

    try {
      const response = await fetch("/api/remix/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remixSpec),
        signal: controller.signal,
      });

      if (!isActive()) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!isActive()) return;
        setRemixRenderError(data.error ?? "Could not start render.");
        return;
      }

      const data = (await response.json()) as { jobId?: string };
      if (!data.jobId || !isActive()) return;

      setRemixJobId(data.jobId);
      setRemixJobStatus("queued");
      await pollRemixJob(data.jobId, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!isActive()) return;
        return;
      }
      if (!isActive()) return;
      setRemixJobId(null);
      setRemixJobStatus(null);
      setRemixRenderError(
        userFacingRemixError(
          err instanceof Error ? err.message : undefined,
        ),
      );
    } finally {
      if (remixPollAbortRef.current === controller) {
        remixPollAbortRef.current = null;
      }
    }
  }, [pollRemixJob, remixSpec]);

  const remixRenderBusy =
    remixJobId !== null &&
    remixJobStatus !== "done" &&
    remixJobStatus !== "failed" &&
    !remixVideoUrl;

  function remixStatusLabel(): string {
    switch (remixJobStatus) {
      case "queued":
        return "Starting render…";
      case "generating":
        return "Generating clips and voiceover…";
      case "rendering":
        return "Stitching in Remotion…";
      default:
        return "Making video…";
    }
  }

  return (
    <SiteShell isLanding>
      <div className="form-stage">
        <div className="form-hero">
          <div className="hero-badge">
            <svg
              className="hero-badge-star"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden
            >
              <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
            </svg>
            Take a video URL. Recreate the format.
          </div>
          <h1 className="content-h1">
            Viral <em>Remix</em>
          </h1>
          <p className="content-lede">
            Paste an Instagram Reel or TikTok link. Preview plays in your
            browser — nothing is saved to disk.
          </p>
        </div>

        <div className="form-meta">
          <form className="scan-form" onSubmit={handleSubmit}>
            <div className="url-scan-row">
              <div className="field">
                <label htmlFor="video-url" className="sr-only">
                  Video URL
                </label>
                <input
                  id="video-url"
                  name="videoUrl"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="instagram.com/reel/… or tiktok.com/…"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !videoUrl.trim()}
                className="btn btn-solid url-scan-btn"
              >
                {loading ? "Fetching…" : "Fetch"}
              </button>
            </div>
          </form>

          {error ? (
            <p className="ingest-message ingest-message-error" role="alert">
              {error}
            </p>
          ) : null}

          {preview ? (
            <div className="ingest-result">
              <p className="ingest-message ingest-message-ok">
                {platformLabel} ready
                {preview.title ? `: ${preview.title}` : ""}
              </p>
              <video
                ref={videoPlayerRef}
                className="ingest-player"
                src={preview.playbackUrl}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={onVideoMetadataLoaded}
              />
              {analyzeLoading || analyzePending ? (
                <div className="analyze-loading-card">
                  <p className="analyze-loading-text">Reading the format…</p>
                  <button
                    type="button"
                    className="analyze-cancel-btn"
                    onClick={cancelAnalyze}
                    aria-label="Cancel analysis"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              {analyzeError ? (
                <p
                  className="ingest-message ingest-message-error"
                  role="alert"
                >
                  {analyzeError}
                </p>
              ) : null}
              {canRetryAnalyze ? (
                <button
                  type="button"
                  className="btn btn-ghost analyze-retry-btn"
                  onClick={retryAnalyze}
                >
                  Read format again
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {analysis ? (
          <div className="analysis-stage">
            <RecreatabilityCard analysis={analysis} />

            {analysis.overallScore < REMIX_MIN_SCORE ? (
              <p className="remix-gate-msg">
                Score is too low to remake honestly with today&apos;s tools.
              </p>
            ) : (
              <>
                {!remixSpec ? (
                  <>
                    {remixPlanLoading ? (
                      <div className="analyze-loading-card">
                        <p className="analyze-loading-text">
                          Building remake plan…
                        </p>
                        <button
                          type="button"
                          className="analyze-cancel-btn"
                          onClick={cancelRemixPlan}
                          aria-label="Cancel remake plan"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="remix-actions">
                        <button
                          type="button"
                          className="btn btn-solid"
                          onClick={() => void runRemixPlan()}
                          disabled={remixPlanLoading}
                        >
                          Remake plan
                        </button>
                      </div>
                    )}
                    {remixPlanError ? (
                      <p
                        className="ingest-message ingest-message-error"
                        role="alert"
                      >
                        {remixPlanError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <RemixPlanCard spec={remixSpec} />
                    <div className="remix-actions">
                      {!remixRenderBusy && !remixVideoUrl ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-solid"
                            onClick={() => void runRemixRender()}
                          >
                            Make video
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void runRemixPlan()}
                            disabled={remixPlanLoading}
                          >
                            Regenerate plan
                          </button>
                        </>
                      ) : null}
                      {remixRenderBusy ? (
                        <div className="analyze-loading-card">
                          <p className="analyze-loading-text">
                            {remixStatusLabel()}
                          </p>
                          <button
                            type="button"
                            className="analyze-cancel-btn"
                            onClick={cancelRemixPoll}
                            aria-label="Stop waiting for render"
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {remixRenderError ? (
                      <p
                        className="ingest-message ingest-message-error"
                        role="alert"
                      >
                        {remixRenderError}
                      </p>
                    ) : null}
                    {remixVideoUrl ? (
                      <div className="ingest-result">
                        <p className="remix-result-label">Your remake</p>
                        <video
                          className="ingest-player"
                          src={remixVideoUrl}
                          controls
                          playsInline
                          preload="metadata"
                        />
                        <div className="remix-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void runRemixRender()}
                          >
                            Make again
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void runRemixPlan()}
                            disabled={remixPlanLoading}
                          >
                            Regenerate plan
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </SiteShell>
  );
}

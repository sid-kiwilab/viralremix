"use client";

import { useEffect, useRef, useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { INGEST_FETCH_TIMEOUT_MS } from "@/lib/ingest-constants";

type PreviewState = {
  platform: "instagram" | "tiktok";
  title: string | null;
  playbackUrl: string;
};

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  function clearPreview() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPreview(null);
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
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

      const platformHeader = response.headers.get("X-Video-Platform");
      const platform =
        platformHeader === "instagram" || platformHeader === "tiktok"
          ? platformHeader
          : "tiktok";

      const titleHeader = response.headers.get("X-Video-Title");
      const title = titleHeader
        ? decodeURIComponent(titleHeader)
        : null;

      setPreview({
        platform,
        title,
        playbackUrl: objectUrl,
      });
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
                className="ingest-player"
                src={preview.playbackUrl}
                controls
                playsInline
                preload="metadata"
              />
            </div>
          ) : null}
        </div>
      </div>
    </SiteShell>
  );
}

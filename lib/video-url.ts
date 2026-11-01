/** Canonical URL rules — keep in sync with scripts/fetch_server.py (_allowed_url). */
export type VideoPlatform = "instagram" | "tiktok";

export type ParsedVideoUrl = {
  platform: VideoPlatform;
  /** Shortcode or video id from the URL. */
  contentId: string;
  /** Normalized URL for yt-dlp. */
  canonicalUrl: string;
};

function tryParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "instagram.com" || host.endsWith(".instagram.com");
}

function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "tiktok.com" || host.endsWith(".tiktok.com");
}

function parseInstagramReel(u: URL): ParsedVideoUrl | null {
  if (!isInstagramHost(u.hostname)) return null;
  const match = u.pathname.match(/\/(?:reel|reels)\/([^/?#]+)/i);
  const shortcode = match?.[1];
  if (!shortcode) return null;
  const canonicalUrl = `https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/`;
  return { platform: "instagram", contentId: shortcode, canonicalUrl };
}

function parseTikTok(u: URL): ParsedVideoUrl | null {
  if (!isTikTokHost(u.hostname)) return null;
  const host = u.hostname.toLowerCase();

  const videoMatch = u.pathname.match(/\/@([^/]+)\/video\/(\d+)/i);
  if (videoMatch) {
    const [, handle, videoId] = videoMatch;
    const canonicalUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`;
    return { platform: "tiktok", contentId: videoId, canonicalUrl };
  }

  if (host === "vm.tiktok.com" || host === "vt.tiktok.com" || host === "www.tiktok.com") {
    const shortPath = u.pathname.replace(/^\/+/, "");
    if (shortPath && !shortPath.includes("/")) {
      return {
        platform: "tiktok",
        contentId: shortPath,
        canonicalUrl: `https://${host}/${shortPath}`,
      };
    }
  }

  return null;
}

export function parseSupportedVideoUrl(raw: string): ParsedVideoUrl | null {
  const u = tryParseUrl(raw);
  if (!u) return null;
  return parseInstagramReel(u) ?? parseTikTok(u);
}

export function videoUrlErrorMessage(): string {
  return "Paste an Instagram Reel or TikTok video link.";
}

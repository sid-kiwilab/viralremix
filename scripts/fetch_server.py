"""HTTP wrapper around fetch_video.download for Cloud Run."""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

from fetch_video import download

MAX_BODY_BYTES = 16_384

# Path rules must stay aligned with lib/video-url.ts (canonical URLs from Next).
_RE_INSTAGRAM_REEL = re.compile(r"/(?:reel|reels)/([^/?#]+)", re.I)
_RE_TIKTOK_VIDEO = re.compile(r"/@[^/]+/video/\d+", re.I)


def _allowed_url(raw: str) -> str | None:
    trimmed = raw.strip()
    if not trimmed:
        return None
    try:
        u = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
    except ValueError:
        return None
    if u.scheme not in ("http", "https"):
        return None

    host = (u.hostname or "").lower()
    path = u.path or ""

    if host == "instagram.com" or host.endswith(".instagram.com"):
        if _RE_INSTAGRAM_REEL.search(path):
            return trimmed if "://" in trimmed else u.geturl()
        return None

    if host == "tiktok.com" or host.endswith(".tiktok.com"):
        if _RE_TIKTOK_VIDEO.search(path):
            return trimmed if "://" in trimmed else u.geturl()
        short = path.strip("/")
        if host in {"vm.tiktok.com", "vt.tiktok.com", "www.tiktok.com"} and short and "/" not in short:
            return trimmed if "://" in trimmed else u.geturl()
        return None

    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] in {"/", "/health"}:
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0].rstrip("/") != "/ingest":
            self._json(404, {"error": "not found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return

        length = 0
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            self._json(400, {"error": "Invalid Content-Length."})
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(400, {"error": "Invalid JSON body."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "Invalid JSON body."})
            return

        raw_url = payload.get("url") if isinstance(payload, dict) else None
        if not isinstance(raw_url, str):
            self._json(400, {"error": "Paste an Instagram Reel or TikTok video link."})
            return

        url = _allowed_url(raw_url)
        if not url:
            self._json(400, {"error": "Paste an Instagram Reel or TikTok video link."})
            return

        work = Path(tempfile.mkdtemp(prefix="viralremix_"))
        out_file = work / "video.mp4"
        try:
            meta = download(url, out_file, work / "dl")
            if not out_file.is_file() or out_file.stat().st_size == 0:
                self._json(502, {"error": "Download finished but no file was found"})
                return
            self._mp4(out_file, str(meta.get("title") or ""))
        except Exception as exc:
            msg = str(exc).strip() or repr(exc)
            self._json(502, {"error": msg})
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _authorized(self) -> bool:
        expected = os.environ.get("FETCH_SERVICE_SECRET") or ""
        if not expected:
            return False
        header = self.headers.get("Authorization") or ""
        if not header.startswith("Bearer "):
            return False
        return secrets.compare_digest(header[7:], expected)

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _mp4(self, path: Path, title: str) -> None:
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        if title:
            self.send_header("X-Video-Title", quote(title, safe=""))
        self.end_headers()
        with path.open("rb") as fh:
            shutil.copyfileobj(fh, self.wfile)


def main() -> int:
    port = int(os.environ.get("PORT") or "8080")
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    sys.stderr.write(f"fetch_server listening on {port}\n")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())

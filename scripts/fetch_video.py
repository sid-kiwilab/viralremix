"""Download Instagram Reel or TikTok to a local MP4 (yt-dlp; curl_cffi when installed)."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=DeprecationWarning)

# Must match yt-dlp --list-impersonate-targets (curl_cffi).
FETCH_IMPERSONATE = "chrome-133"


def _has_curl_cffi() -> bool:
    try:
        import curl_cffi  # noqa: F401

        return True
    except ImportError:
        return False


def _has_ytdlp() -> bool:
    try:
        import yt_dlp  # noqa: F401

        return True
    except ImportError:
        return False


def download(url: str, out_mp4: Path, work_dir: Path) -> dict:
    if not _has_ytdlp():
        raise RuntimeError("Install yt-dlp: pip install yt-dlp")

    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    stem = out_mp4.with_suffix("")
    ydl_opts: dict = {
        "outtmpl": str(stem) + ".%(ext)s",
        "format": "best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 60,
    }

    if _has_curl_cffi():
        from yt_dlp.networking.impersonate import ImpersonateTarget

        ydl_opts["impersonate"] = ImpersonateTarget.from_str(FETCH_IMPERSONATE)
    import yt_dlp

    class _QuietLogger:
        def debug(self, msg: object) -> None:
            pass

        def info(self, msg: object) -> None:
            pass

        def warning(self, msg: object) -> None:
            pass

        def error(self, msg: object) -> None:
            pass

    ydl_opts["logger"] = _QuietLogger()

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Could not read video info from URL")

    if not out_mp4.is_file():
        ext = info.get("ext") or "mp4"
        alt = stem.with_suffix(f".{ext}")
        if alt.is_file():
            if ext != "mp4":
                shutil.move(str(alt), str(out_mp4))
            else:
                alt.rename(out_mp4)
        else:
            raise RuntimeError("Download finished but no file was found")

    return {
        "title": info.get("title"),
        "duration": info.get("duration"),
        "extractor": info.get("extractor_key") or info.get("extractor"),
        "videoId": str(info.get("id") or info.get("display_id") or ""),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--work", required=True, type=Path)
    args = parser.parse_args()

    try:
        meta = download(args.url, args.out, args.work)
        print(json.dumps({"ok": True, "meta": meta}))
        return 0
    except Exception as exc:
        msg = str(exc).strip() or repr(exc)
        print(json.dumps({"ok": False, "error": msg}))
        return 1


if __name__ == "__main__":
    sys.exit(main())

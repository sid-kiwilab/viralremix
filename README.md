# Viral Remix

**Take a video URL. Recreate the format.**

Sister of [Viral Radar](https://github.com/sid-kiwilab/viralradar): Radar finds outlier formats in a niche; Remix remakes one video. **Fetch** pulls an Instagram Reel or TikTok via Cloud Run and previews it in the browser (session blob URL only — nothing kept in the repo).

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing — paste URL, **Fetch**, in-browser player |
| `/how-it-works` | Intended flow (steps 2–3 not built) |
| `POST /api/ingest` | Proxy to Cloud Run fetch worker (or local Python if unset) |

## Local dev

**Prerequisites:** Node.js. For Cloud Run ingest: `CLOUD_RUN_URL` + `FETCH_SERVICE_SECRET` in `.env` (see [`.env.example`](.env.example)). Optional: `NEON_CONNECTION_STRING` for download error logs. If `CLOUD_RUN_URL` is unset or blank, use local Python: `pip install yt-dlp curl_cffi`.

```bash
cd c:\flutter_apps\viralremix
npm install
npm run dev
```

Or double-click [`start.bat`](start.bat).

```bash
npm run build
npm run lint
```

Owner verifies UI in the browser. Agents do not fetch localhost.

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` if needed. Never commit real keys.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUD_RUN_URL` | For Cloud Run ingest | Trimmed service URL; empty → local Python |
| `FETCH_SERVICE_SECRET` | With `CLOUD_RUN_URL` | Same value on Next and Cloud Run (`Bearer …`) |
| `NEON_CONNECTION_STRING` | For error logs | Failed downloads only (not client cancel / 499) |
| `PYTHON_PATH` | No | Local fallback only |

## Project structure

```
app/
  page.tsx              # Landing + Fetch UI
  api/ingest/route.ts   # Ingest API
  icon.svg              # Tab icon
  how-it-works/
components/             # Site shell, header, remix mark
lib/
  video-url.ts          # IG Reel / TikTok URL parsing
  ingest-error-log.ts   # Neon error rows
  ingest-constants.ts   # Fetch timeout (290s)
scripts/
  fetch_video.py        # yt-dlp + curl_cffi download
  fetch_server.py       # Cloud Run HTTP wrapper
  requirements-fetch.txt
Dockerfile              # Fetch worker (deploy: see docs/LIVE.md)
docs/                   # LIVE, JOURNAL
harness/                # PLAN, REVIEW, FIX, SYNC
```

## Docs

- Live ops: [`docs/LIVE.md`](docs/LIVE.md)
- Session journal: [`docs/JOURNAL.md`](docs/JOURNAL.md)
- Harness: `harness/PLAN.md`, `REVIEW.md`, `FIX.md`, `SYNC.md`

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind 4)
- Cloud Run ingest: Python, yt-dlp, curl_cffi, ffmpeg
- Neon: download error log
- Hosting later: Vercel for the Next app (unset)

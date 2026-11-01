# Viral Remix

**Take a video URL. Recreate the format.**

Sister of [Viral Radar](https://github.com/sid-kiwilab/viralradar): Radar finds outlier formats in a niche; Remix remakes one video. **Fetch** pulls an Instagram Reel or TikTok via Cloud Run and previews it in the browser (session blob URL only — nothing kept in the repo). After fetch, **Analyze** scores recreatability with OpenRouter + Gemini (native video).

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing — paste URL, **Fetch**, player, recreatability score card (720px block below player) |
| `/how-it-works` | Flow (step 3 Remix not built) |
| `POST /api/ingest` | Proxy to Cloud Run fetch worker (or local Python if unset) |
| `POST /api/analyze` | OpenRouter Gemini recreatability analysis (multipart MP4) |

## Local dev

**Prerequisites:** Node.js. For Cloud Run ingest: `CLOUD_RUN_URL` + `FETCH_SERVICE_SECRET` in `.env` (see [`.env.example`](.env.example)). For analyze after Fetch: `OPENROUTER_API_KEY`. Optional: `NEON_CONNECTION_STRING` for download error logs. If `CLOUD_RUN_URL` is unset or blank, use local Python: `pip install yt-dlp curl_cffi`.

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
| `NEON_CONNECTION_STRING` | For Neon logs | `ingest_errors` + `analyze_runs` (not client cancel / 499) |
| `PYTHON_PATH` | No | Local fallback only |
| `OPENROUTER_API_KEY` | For analyze | Server-side; required for score after Fetch |
| `OPENROUTER_VIDEO_MODEL` | No | Default `google/gemini-2.5-flash` |
| `EVOLINK_API_KEY` | No | Future Remix generation (not used yet) |

## Project structure

```
app/
  page.tsx              # Landing + Fetch + analyze UI (720px score card)
  globals.css           # Landing + recreatability card styles
  api/ingest/route.ts   # Ingest API
  api/analyze/route.ts  # Recreatability analyze API
  icon.svg              # Tab icon (orbital remix arc)
  how-it-works/
components/             # Site shell, header, logo mark, recreatability card
lib/
  video-url.ts          # IG Reel / TikTok URL parsing
  ingest-error-log.ts   # Neon error rows
  ingest-constants.ts   # Fetch timeout (290s)
  analyze-constants.ts  # Analyze timeout + size cap
  analyze-error.ts      # Sanitized analyze errors
  analyze-run-log.ts    # Neon analyze_runs
  openrouter.ts         # OpenRouter video client
  recreatability.ts     # Prompt + JSON schema
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

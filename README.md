# Viral Remix

**Take a video URL. Recreate the format.**

Sister of [Viral Radar](https://github.com/sid-kiwilab/viralradar): Radar finds outlier formats in a niche; Remix remakes one video. **Fetch** pulls an Instagram Reel or TikTok via Cloud Run and previews it in the browser (session blob URL only — nothing kept in the repo). After fetch, **Analyze** scores recreatability for a simplified AI remake (OpenRouter + Gemini native video; prompt version logged in Neon).

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing — **Fetch**, analyze, **Remake plan** + **Make video** (score ≥ 60) |
| `/how-it-works` | Fetch → analyze → remix in the browser |
| `/avatars` | House model **Luca** (reference JPGs for EvoLink) |
| `POST /api/ingest` | Proxy to Cloud Run fetch worker (or local Python if unset) |
| `POST /api/analyze` | OpenRouter Gemini recreatability analysis (multipart MP4) |
| `POST /api/remix/plan` | Build remake plan JSON from analysis (OpenRouter) |
| `POST /api/remix/render` | Start background EvoLink + Remotion job |
| `GET /api/remix/[jobId]` | Poll render job status |
| `GET /api/remix/[jobId]/video` | Stream finished MP4 |

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

Owner verifies UI in the browser (`/`, `/how-it-works`, `/avatars`). Agents do not fetch localhost.

## Remix (browser or CLI)

On home, after analyze **≥ 60**: **Remake plan** → review → **Make video**. Requires `OPENROUTER_API_KEY` and `EVOLINK_API_KEY` in `.env` (local dev only; render spawns a background worker).

Headless CLI (same pipeline, writes to `out/`):

```bash
npm run remix                  # latest eligible row in Neon analyze_runs
npm run remix -- analysis.json # or saved RecreatabilityAnalysis JSON
```

Requires `OPENROUTER_API_KEY`, `EVOLINK_API_KEY`, and `NEON_CONNECTION_STRING` (unless you pass a JSON file). Writes `out/remix-spec.json`, `out/remix-assets/`, and `out/remix.mp4`. Luca reference images must be public HTTP URLs (default GitHub raw on `main`; override with `REMIX_LUCA_REF_BASE` — see [`lib/characters.ts`](lib/characters.ts)).

## Recreate segment (TikTok / Reel slice)

Headless pipeline for remaking the **first N seconds** of a reference video with **Luca** + Remotion (or EvoLink-only tests). Output: `out/recreate/<video-id>/` (gitignored).

```bash
# Full pipeline (fetch → plan → ASR → EvoLink → Remotion)
npm run recreate-segment -- --url "https://www.tiktok.com/@user/video/123" --sec 16

# One 8s EvoLink lip-sync clip from first-8s ASR (no Remotion) — push Luca JPGs to main first
npm run evolink-from-reference -- --url "https://www.tiktok.com/@user/video/123" --sec 8

# Transcribe a local clip (Groq/OpenAI if keys set)
npm run transcribe-local -- out/recreate/<id>/first-8s.mp4
```

Requires `OPENROUTER_API_KEY`, `EVOLINK_API_KEY`, and public Luca refs. ASR prefers **`GROQ_API_KEY`** or **`OPENAI_API_KEY`** when set. See [`docs/RECREATE-STRATEGY.md`](docs/RECREATE-STRATEGY.md) and [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md).

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
| `OPENROUTER_PLAN_MODEL` | No | Remix CLI plan step; defaults like analyze |
| `EVOLINK_API_KEY` | For Remix (CLI + home **Make video**) | Seedance 2.5 + Qwen TTS |
| `EVOLINK_TTS_VOICE` | No | Optional Qwen voice id for VO |
| `REMIX_LUCA_REF_BASE` | No | Public URL base for Luca EvoLink refs (default GitHub raw on `main`) |
| `GROQ_API_KEY` | No | Preferred ASR for recreate / `evolink-from-reference` (Whisper) |
| `OPENAI_API_KEY` | No | ASR fallback if Groq unset |
| `TRANSCRIBE_PROVIDER` | No | Force `groq` \| `openai` \| `openrouter` |
| `EVOLINK_VIDEO_QUALITY` | No | e.g. `720p` for cheap recreate |
| `EVOLINK_LIPSYNC_MODEL` | No | e.g. `seedance-2.0-mini-reference-to-video` |
| `RECREATE_TRIM_TAIL_SEC` | No | Trim tail on long segments (default 1s when `--sec 16`) |

## Project structure

```
app/
  page.tsx              # Landing + Fetch + analyze UI (720px score card)
  globals.css           # Landing + recreatability card styles
  api/ingest/route.ts   # Ingest API
  api/analyze/route.ts  # Recreatability analyze API
  icon.svg              # Tab icon (orbital remix arc)
  how-it-works/
  avatars/page.tsx      # House model Luca (profile UI)
components/             # Site shell, header, logo mark, recreatability card
lib/
  characters.ts         # Avatar catalog (role, profileSrc, generation asset paths)
  video-url.ts          # IG Reel / TikTok URL parsing
  ingest-error-log.ts   # Neon error rows
  ingest-constants.ts   # Fetch timeout (290s)
  analyze-constants.ts  # Analyze timeout + size cap
  analyze-error.ts      # Sanitized analyze errors
  analyze-run-log.ts    # Neon analyze_runs
  openrouter.ts         # OpenRouter video client
  recreatability.ts     # Prompt v2 + buildRecreatabilityUserPrompt + JSON schema
  remix-spec.ts         # Remotion edit plan schema
  remix-plan.ts         # OpenRouter plan generator
  evolink.ts            # EvoLink video + TTS client
  remix-analyze-load.ts # Neon / JSON analysis loader for CLI
remotion/               # Remotion composition (Remix)
scripts/
  remix.ts              # analyze → plan → EvoLink → render
  recreate-segment.ts   # TikTok segment → Luca + Remotion
  evolink-from-reference-segment.ts  # one EvoLink clip from reference ASR
  transcribe-local-file.ts
  fetch_video.py        # yt-dlp + curl_cffi download
  fetch_server.py       # Cloud Run HTTP wrapper
  optimize_avatar_display.py  # Rebuild Luca profile-display.webp from profile.jpg
  requirements-fetch.txt
Dockerfile              # Fetch worker (deploy: see docs/LIVE.md)
public/avatars/luca/    # Luca assets (profile-display.webp for UI; full JPGs for Remix)
docs/                   # LIVE, PLAYBOOK, RECREATE-STRATEGY, JOURNAL
harness/                # PLAN, REVIEW, FIX, SYNC
```

After updating `public/avatars/luca/profile.jpg`, rebuild the UI portrait (requires Pillow: `pip install pillow`):

```bash
python scripts/optimize_avatar_display.py
```

## Docs

- Live ops: [`docs/LIVE.md`](docs/LIVE.md)
- Session journal: [`docs/JOURNAL.md`](docs/JOURNAL.md)
- Harness: `harness/PLAN.md`, `REVIEW.md`, `FIX.md`, `SYNC.md`

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind 4)
- Cloud Run ingest: Python, yt-dlp, curl_cffi, ffmpeg
- Neon: download error log + analyze runs
- Remix CLI: OpenRouter plan, EvoLink (Seedance 2.5 + Qwen TTS), Remotion 4 render
- Hosting later: Vercel for the Next app (unset)

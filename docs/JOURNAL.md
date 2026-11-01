# Viral Remix: session journal

Dated log of what shipped each work session. Stable ops and architecture live in [LIVE.md](LIVE.md).

Newest entries at the top.

---

## 2026-11-02: Beats list layout (recreatability card)

- **Shipped:** Beats without leading timestamps (e.g. `0-2s:`) no longer reserve an empty timeline column; they render as the same dotted list used under **Remakes well**. Rows with timestamps still show the time column.
- **Key files:** `components/recreatability-card.tsx`, `app/globals.css`
- **Owner:** Re-analyze or refresh; confirm Beats align left with no blank gutter when times are absent.
- **Harness:** ad hoc → SYNC (this entry).

---

## 2026-11-02: Remix orbital header + tab icon

- **Shipped:** New mark: faint orbit ring + **remix arc** + center dot (distinct from Viral Radar sweep) in [`components/logo-mark.tsx`](../components/logo-mark.tsx) and [`app/icon.svg`](../app/icon.svg). Supersedes stacked-video and radar-copy marks.
- **Key files:** `components/logo-mark.tsx`, `app/icon.svg`, `docs/LIVE.md`
- **Owner:** Hard-refresh tab; confirm header mark on `/`.
- **Harness:** ad hoc → SYNC (this entry).

---

## 2026-11-02: Analyze runs logging hardening (FIX)

- **Shipped:** [`app/api/analyze/route.ts`](../app/api/analyze/route.ts) — shared `logAnalyzeRun` / `validationError`; pre-OpenRouter failures (**400**, **413** size cap, bad MIME) write `analyze_runs` with client metadata when present. [`getConfiguredOpenRouterVideoModel()`](../lib/openrouter.ts) single source for default model in logs. Home **`analyzePending`** shows “Reading the format…” while waiting for `loadedmetadata` (or 2.5s fallback); cancel clears pending + fallback timer.
- **Key files:** `app/api/analyze/route.ts`, `lib/openrouter.ts`, `app/page.tsx`
- **Gaps:** Top-level **503** (missing key) and broken multipart still not logged.
- **Owner:** Optional: query `analyze_runs` where `status = 413` to track size-cap hits.
- **Harness:** REVIEW → FIX → SYNC (this entry).

---

## 2026-11-02: Recreatability card UI

- **Shipped:** Redesigned score card for scanability: **720px** analysis block below the player (fetch/video stay at `--meta-max`). Header with Instrument Serif score + Low/Medium/High pill; format read as labeled hook/speech, beat timeline, on-screen text chips; dimension meters; **Remakes well** / **Hard to remake** columns from 640px. **Fix:** auto-analyze still prefers `loadedmetadata` for `durationSec`, with a **2.5s fallback** if metadata never fires; sr-only accessible card title; removed dead mobile CSS.
- **Key files:** `components/recreatability-card.tsx`, `app/page.tsx`, `app/globals.css`
- **Gaps:** Remix (step 3) not started. No results/history UI for `analyze_runs`.
- **Owner:** Fetch + analyze; confirm card layout desktop and narrow; verify analyze still starts without manual retry.
- **Harness:** PLAN → build → REVIEW → FIX → SYNC (this entry).

---

## 2026-11-02: Versioned analyze runs (Neon)

- **Shipped:** Each analyze (ok/fail, not **499**) logs to Neon `analyze_runs`: `PROMPT_VERSION`, full system/user prompts, model, jsonb `result`, scores, URL/platform/title, `video_bytes`, `duration_sec`, OpenRouter `usage` tokens, `latency_ms`. OpenRouter client returns usage + timing. Home sends metadata with multipart analyze; auto-analyze waits for video `loadedmetadata` for duration.
- **Key files:** `lib/analyze-run-log.ts`, `lib/recreatability.ts` (`PROMPT_VERSION`), `lib/openrouter.ts`, `app/api/analyze/route.ts`, `app/page.tsx`, docs + `.env.example`
- **Gaps:** No results/history UI yet. MP4 not stored in Neon.
- **Owner:** Fetch + analyze; run SQL on `analyze_runs` in Neon.
- **Harness:** PLAN → build (this entry).

---

## 2026-11-01: Recreatability analyze (OpenRouter Gemini)

- **Shipped:** After Fetch, home auto-runs `POST /api/analyze` with session MP4 (multipart, 40MB cap, 90s timeout). OpenRouter Chat Completions + Gemini native video (`processing: static`) → recreatability card (0–100, eight dimensions, format read). Cancel in-flight analyze (×); **Read format again** after cancel/failure without re-Fetch. Analyze errors sanitized ([`lib/analyze-error.ts`](../lib/analyze-error.ts)); upstream timeout → **504**; client cancel → **499**. Step 2 live on `/how-it-works`; default model `google/gemini-2.5-flash`; EvoLink documented for Remix only.
- **Key files:** `app/api/analyze/route.ts`, `lib/openrouter.ts`, `lib/recreatability.ts`, `lib/analyze-constants.ts`, `lib/analyze-error.ts`, `components/recreatability-card.tsx`, `app/page.tsx`, `app/globals.css`, docs + `.env.example`
- **Gaps:** Remix (step 3) not started. Analyze re-uploads MP4 from browser; Vercel body limits TBD. No Neon for analyze failures or scores. Watch real Fetch MP4 sizes vs 40MB (Instagram HD often 25–35MB / ~15s).
- **Owner:** `OPENROUTER_API_KEY` in `.env`, restart dev server; Fetch a public Reel/TikTok; confirm score, cancel, and retry.
- **Harness:** PLAN → build → REVIEW → FIX → SYNC (this entry).

---

## 2026-11-01: Cloud Run ingest, Neon errors, remix icon

- **Shipped:** Reel/TikTok download on Cloud Run (`viralremix-fetch`, GCP `viral-remix-app`, `australia-southeast1`). Docker + yt-dlp + curl_cffi + ffmpeg. Next `POST /api/ingest` proxies to Cloud Run when `CLOUD_RUN_URL` is set (trimmed); local Python if unset/blank. Failures → Neon `ingest_errors` (`raw_error` + sanitized `user_error`). Remix header mark + `app/icon.svg` tab icon. **Fix (ingest):** URL rules synced with worker, env trim + secret guard, worker redeploy `00003-4xt`. **Fix (abort):** `request.signal` cancels upstream Cloud Run fetch / local Python; client 290s timeout + superseded-fetch abort; **499** on cancel (no Neon row); `lib/ingest-constants.ts`.
- **Key files:** `Dockerfile`, `scripts/fetch_server.py`, `app/api/ingest/route.ts`, `app/page.tsx`, `lib/ingest-constants.ts`, `lib/ingest-error-log.ts`, `lib/video-url.ts`, `components/logo-mark.tsx`, `app/icon.svg`, docs + `.env.example`
- **Gaps:** Next app not on Vercel. Full MP4 buffered in Next. Worker may finish a download after Next aborts the HTTP call. No Cloud Run rate limit. Instagram may need cookies on some Reels.
- **Owner:** `.env` with `CLOUD_RUN_URL`, `FETCH_SERVICE_SECRET`, `NEON_CONNECTION_STRING`; restart dev server; Fetch a public Reel/TikTok; on failure check Neon `ingest_errors`.
- **Harness:** PLAN → build → REVIEW → FIX → SYNC (this entry).

---

## 2026-11-01: Browser video fetch (+ GitHub, review)

- **Shipped:** GitHub remote `sid-kiwilab/viralremix` on `main`. Home **Fetch** → `POST /api/ingest` → Python `scripts/fetch_video.py` (yt-dlp + curl_cffi) → MP4 bytes → client blob preview (no repo cache; OS temp only during download). URL allowlist for Instagram Reels and TikTok. User-facing errors sanitized; abort/stale-fetch guards on client; ingest fails fast before buffering failed downloads.
- **Key files:** `app/page.tsx`, `app/api/ingest/route.ts`, `lib/video-url.ts`, `lib/video-paths.ts`, `scripts/fetch_video.py`, `app/how-it-works/page.tsx`, `README.md`, `docs/LIVE.md`, `.gitignore`
- **Gaps:** Instagram may need cookies on some Reels. Ingest not Vercel-ready. AI / remix steps not started.
- **Owner:** `pip install yt-dlp curl_cffi`, `npm run dev`, verify **Fetch** on a public Reel/TikTok.
- **Harness:** PLAN → build → REVIEW (prior session; superseded by Cloud Run work above).

---

## 2026-11-01: Repo init (landing only)

- **Shipped:** New repo next to Viral Radar. Next.js 16 landing with the same cinematic shell (hero loop, grain, Inter + Instrument Serif). Video URL field; **Remix** disabled. `/how-it-works` stubs. Harness + LIVE/JOURNAL/README + `start.bat`. No backend.
- **Key files:** `app/page.tsx`, `app/how-it-works/page.tsx`, `components/site-shell.tsx`, `docs/LIVE.md`, `harness/`
- **Gaps:** Remix pipeline not started. No GitHub remote. Owner: open landing via `start.bat` / `npm run dev`.
- **Harness:** init (this entry).

# Viral Remix: session journal

Dated log of what shipped each work session. Stable ops and architecture live in [LIVE.md](LIVE.md).

Newest entries at the top.

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

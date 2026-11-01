# Viral Remix

**Take a video URL. Recreate the format.**

Sister of [Viral Radar](https://github.com/sid-kiwilab/viralradar): Radar finds outlier formats in a niche; Remix remakes one video. Landing only — remix is not wired yet.

## Routes

- `/`: landing (video URL field; **Remix** disabled)
- `/how-it-works`: intended flow (honest stubs)

## Local dev

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

## Docs

- Live ops: [`docs/LIVE.md`](docs/LIVE.md)
- Session journal: [`docs/JOURNAL.md`](docs/JOURNAL.md)
- Harness: `harness/PLAN.md`, `REVIEW.md`, `FIX.md`, `SYNC.md`

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind 4)
- Hosting later: Vercel (unset)

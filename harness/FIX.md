# FIX — execute lean fixes

DONT MODIFY THIS FILE

This is the Viral Remix fix harness for this repo (`c:\flutter_apps\viralremix`).

Act on review findings (or obvious bugs you find while fixing). This is the **do work** pass.

## Rules

- Lean diffs only — fix what is worth fixing, skip noise
- Gut dead starter code
- Keep architecture minimal and robust
- Re-check race-prone areas after changes: client fetches after unmount, form submits, API routes
- If you add an env var, update this repo's env example and [LIVE.md](../docs/LIVE.md) in the same pass (or leave that for SYNC)
- Stay in this repo. Do not port behavior from a sibling app unless the user asked
- Follow [`docs/LIVE.md`](../docs/LIVE.md). Do not invent stack, database, or deploy rules in this file

## Verify

After changes, run this repo's build and lint commands when they exist.

Owner verifies UI in the browser; do not fetch localhost. Do not invent a migrator, eval harness, or deploy script unless the user asked.

## Report back

- **Fixed** — bullet list of what changed
- **Skipped** — anything intentionally left alone and why (one line each)

Then the user drops **SYNC**.

DONT MODIFY THIS FILE

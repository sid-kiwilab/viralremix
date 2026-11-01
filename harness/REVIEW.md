# REVIEW — review and simplify

DONT MODIFY THIS FILE

This is the Viral Remix review harness for this repo (`c:\flutter_apps\viralremix`).

Post-implementation review. **Read the code** — do not treat a successful build as proof of quality.

## What to check

- Missed requirements from the user's goal
- Over-engineering, duplicate logic, unnecessary abstraction
- Dead starter code — gut it, do not preserve "just in case"
- Race conditions: stale async responses, unmount guards on client components, duplicate fetches
- Architecture still minimal and coherent for this repo's layout
- Secrets stay out of git; new env vars have placeholders only
- Changes belong in this repo — no leftover paths, copy, or conventions from a sibling app
- This repo's own database and deploy rules in [`docs/LIVE.md`](../docs/LIVE.md), when it has them

## What to do

- Simplify where safe and obvious
- Apply only **trivial** inline cleanups (typos, dead imports) — nothing that needs a multi-file refactor
- **Do not** run large refactors or feature work here — that is FIX

## Output format

Return a **findings list**:

| Severity | Area | Finding |
|----------|------|---------|
| high / medium / low | file or module | one line |

If nothing worth fixing, say explicitly: **No findings.** Then the user can drop **SYNC**.

If there are findings, the user drops **FIX**.

Do not over-report nitpicks on code that is already solid.

DONT MODIFY THIS FILE

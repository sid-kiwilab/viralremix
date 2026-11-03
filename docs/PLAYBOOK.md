# Viral Remix — playbook (preferences & learnings)

**Living doc.** When we learn something or change a product preference, add it here. Agents: read this before remix / recreate / EvoLink work. Stable ops stay in [LIVE.md](LIVE.md); session ship log in [JOURNAL.md](JOURNAL.md).

---

## Product preferences (owner)

| Preference | Rule |
|------------|------|
| **Graphics in post** | **Never** ask EvoLink/Seedance to render text, captions, pills, logos, or UI. AI clip = Luca + set + motion (+ optional native audio). **All** timed text → Remotion `textOverlays` (`header-pill`, `caption-yellow`, character-strip, etc.). Enforced in code: [`lib/ai-video-prompt.ts`](../lib/ai-video-prompt.ts) + every submit via [`lib/evolink.ts`](../lib/evolink.ts). |
| **Cheap iteration** | Default **720p**, **mini** ref-to-video (`seedance-2.0-mini-reference-to-video`), **`generate_audio: true`** for speaking clips (~10–25 credits / 4–8s). Avoid **1080p Seedance 2.5** for drafts (~400 credits / 8s). |
| **Clip length** | EvoLink bills **4–8s** per job; cap with `EVOLINK_VIDEO_MAX_SEC`. Longer TikToks → chain segments (`recreate-segment --start N`) or loop short B-roll in Remotion. |
| **Luca for remakes** | House model **Luca**; refs `@image1` profile, `@image2` face, `@image3` turnaround. |
| **Lesson-style remakes** | Timed alphabet / on-screen syllables → **character-strip** + **per-syllable TTS**, not English `speechSummary` narrator. See [`lib/remix-plan-enrich.ts`](../lib/remix-plan-enrich.ts). |
| **Rosetta / segment recreate** | **Vision** + **word ASR** → overlays from transcript. **&gt;8s default:** **`RECREATE_AUDIO=lipsync-segments`** — muted **base loop** + **EvoLink mini lip-sync per phrase** at ASR `startSec` (same great `generate_audio` as lipsync-lab). Alt: `tts` (voice timed, mouth idle). `evolink` = chained 8s clips. `--sec` up to **20**. |
| **Lip-sync experiments** | `npm run lipsync-lab` — quick 4s English line, same cheap defaults; owner liked native-audio path (~11 credits). |

---

## Pipelines (what runs where)

| Flow | Entry | Output |
|------|--------|--------|
| Home **Make video** | `POST /api/remix/render` → `scripts/remix-render.ts` | `out/remix.mp4` (local job dir) |
| CLI remix | `npm run remix` | `out/remix-spec.json`, `out/remix-assets/`, `out/remix.mp4` |
| Segment recreate | `npx tsx scripts/recreate-segment.ts --url … --sec 8` | `out/recreate/<id>/remake-{N}s.mp4` |
| Lip-sync lab | `npm run lipsync-lab` | `out/lipsync-lab/` |

**Windows:** spawn remix with `shell: true` ([`lib/remix-spawn.ts`](../lib/remix-spawn.ts)). Prefer `npx tsx scripts/….ts --flags` over `npm run … -- --flags` (npm sometimes eats args).

**Remotion on Windows:** local assets served over **HTTP** ([`lib/local-asset-server.ts`](../lib/local-asset-server.ts)), not raw `file://`. EvoLink often returns **HEVC** or **24fps H.264** → **`ensureH264Mp4`** re-encodes to **H.264 30fps** ([`lib/ffmpeg-transcode.ts`](../lib/ffmpeg-transcode.ts)); use **`keepAudio: true`** for speaking clips.

---

## EvoLink & costs (observed)

- **402** = billing / credits — top up account.
- **Unreachable Luca refs** = GitHub raw 404 or private URL → generic “Could not complete remix” unless [`lib/remix-error.ts`](../lib/remix-error.ts) detects fetch failure.
- **Rough credits:** mini 720p 4s + audio ≈ **11**; 8s mini ≈ **15–25** (verify on dashboard); 8s 1080p 2.5 ≈ **~401 (~$5.9)** — iteration only with owner approval.

Env knobs: `EVOLINK_VIDEO_QUALITY`, `EVOLINK_VIDEO_MAX_SEC`, `EVOLINK_LIPSYNC_MODEL`, `EVOLINK_TTS_VOICE`, `REMIX_LUCA_REF_BASE`.

---

## Luca reference images (blocker we hit repeatedly)

- JPGs live in **`public/avatars/luca/`** locally.
- Default URLs point at **GitHub raw on `main`** — often **404** until JPGs are pushed.
- EvoLink must fetch refs over **public HTTPS**. Fixes (pick one):
  1. Push `public/avatars/luca/*.jpg` to **`main`**, or
  2. Set **`REMIX_LUCA_REF_BASE`** in `.env` to a stable public base (no localhost), or
  3. **Dev-only:** `serve public` + tunnel + temporary `REMIX_LUCA_REF_BASE` (stop tunnel when done).

Do **not** commit `.env` or expose API keys.

---

## Remotion overlay styles (post only)

| `style` | Use |
|---------|-----|
| `header-pill` | Top title bar (e.g. language + flag) |
| `caption-yellow` | Bottom TikTok-style yellow caption (one line at a time) |
| `word-hero` | Large centered vocabulary (e.g. Merhaba) — not a pill |
| `character-strip` | Timed lesson letters (green highlight on active) |

Segment analyze prompt: [`lib/segment-analyze.ts`](../lib/segment-analyze.ts) — extracts **timing** for Remotion, not for burning into AI video.

---

## Artifacts (examples)

| Path | Notes |
|------|--------|
| `out/recreate/7325092684559961387/remake-4s.mp4` | Rosetta TikTok first 4s — “quite good” |
| `out/recreate/7325092684559961387/remake-8s.mp4` | Rosetta first 8s (Luca + Remotion overlays) |
| `out/recreate/7325092684559961387/segment-plan-8s.json` | 8s plan |
| `out/lipsync-lab/lipsync-native-audio.mp4` | Cheap lip-sync test |
| `out/remix.mp4` | Korean alphabet remix (lesson enrich) |

---

## When adding features

1. **AI video prompt** → use helpers in `lib/ai-video-prompt.ts`; do not duplicate “no text” wording.
2. **New overlay type** → Remotion + spec types only; never Seedance prompt.
3. **New doc facts** → append a dated bullet under **Changelog** below.

---

## Changelog

- **2026-11-03:** Owner rule: **zero burned-in text/UI in AI clips**; all graphics in Remotion. Centralized in `lib/ai-video-prompt.ts`; this playbook created.

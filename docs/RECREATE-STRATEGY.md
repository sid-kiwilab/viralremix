# Segment recreate — strategy toward “perfect”

Current default for **&gt;8s**: `RECREATE_AUDIO=lipsync-segments` + set plate `@image4` + word ASR overlays.

## Issue → lever

| Symptom | Cause | Fix (in order) |
|--------|--------|----------------|
| **Words cut off** | Remotion played clip shorter than generated speech; ASR span too tight vs billed 4s | Bill from **word count**; play **full** probed clip; **merge** adjacent ASR phrases |
| **Sit vs stand drift** | Each phrase = new gen; plan said “stands” | **`presenterPose`** from vision (match original); **SEATED** lock in every prompt + idle base |
| **Background drift** | Independent gens | **@image4** set plate + base loop (done) |
| **Timing vs original** | Lip-sync clip starts at ASR time but speech length ≠ ASR span | Merged phrases; optional `RECREATE_AUDIO=tts` for clock-perfect VO (no lips) |
| **Turkish pronunciation** | Seedance English-first | Per-word TTS for TR only (future); or shorter TR heroes in Remotion only |
| **Too many hard cuts** | 1 clip per ASR line | **mergeSegmentsForLipsync**; target 3–4 clips / 16s not 7 |

## Pipeline order (target)

1. Trim segment → **vision plan** (pose, set, overlays rough).  
2. **ASR words + segments** (truth for copy + timing).  
3. **Merge segments** for lip-sync jobs.  
4. **Set plate** from source frame → `@image4`.  
5. **Base loop** (seated idle, muted, 8s looped).  
6. **Phrase lip-sync clips** (pose lock, full clip duration in timeline).  
7. **Remotion** overlays from words + heroes.  

## Env knobs

| Var | Values |
|-----|--------|
| `RECREATE_AUDIO` | `lipsync-segments` (default &gt;8s), `evolink`, `tts`, `source` |
| `RECREATE_VISUAL_MODE` | `stable-loop` (default &gt;8s), `chain` |
| `REMIX_LUCA_REF_BASE` | Required for EvoLink + set plate URLs |

## “Perfect” bar (honest)

- **Perfect timing + pronunciation + lips + one continuous sit** → not one model call; likely **hybrid**: reference audio or TTS timeline + **one** long take tech when EvoLink allows, or manual hero 8s + Remotion for the rest.  
- **Ship-quality Rosetta-style 16s** → merged phrase lip-sync + seated lock + full clip playback is the current best bang/credit.

See [PLAYBOOK.md](PLAYBOOK.md) for defaults.

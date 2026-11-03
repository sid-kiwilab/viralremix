/**
 * Recreate first N seconds of a TikTok/Reel with Luca + Remotion overlays.
 *
 *   npm run recreate-segment -- --url "https://www.tiktok.com/..." --sec 4
 *
 * Requires: OPENROUTER_API_KEY, EVOLINK_API_KEY, public Luca refs (REMIX_LUCA_REF_BASE).
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildLucaIdleLoopVideoPrompt,
  buildLucaSpeakingVideoPrompt,
} from "@/lib/ai-video-prompt";
import { loadLocalEnv } from "@/lib/load-env";
import {
  downloadToFile,
  submitReferenceVideoTaskWithOptions,
  waitForTaskResult,
} from "@/lib/evolink";
import { ensureH264Mp4 } from "@/lib/ffmpeg-transcode";
import { buildOverlaysFromTranscript } from "@/lib/segment-overlay-from-transcript";
import { generateSegmentLipsyncClips } from "@/lib/segment-lipsync-segments";
import { generateTtsVoTracksFromSegments } from "@/lib/segment-tts-audio";
import {
  extractSetPlateJpg,
  publishRecreatePlate,
  publishSetPlateForEvoLink,
} from "@/lib/segment-set-plate";
import { buildVisualContinuityLock } from "@/lib/segment-visual-continuity";
import {
  analyzeSegmentRemake,
  type SegmentRemakePlan,
} from "@/lib/segment-analyze";
import {
  applyTranscriptToPlan,
  splitTranscriptForClips,
  transcribeSegmentVideo,
} from "@/lib/segment-transcribe";
import { readLipsyncClipManifest } from "@/lib/lipsync-clip-manifest";
import { getRecreateOutputDurationSec } from "@/lib/recreate-output-duration";
import {
  buildLipsyncTimelineEntries,
  lipsyncTimelineToResolvedClips,
} from "@/lib/lipsync-timeline";
import { renderRemixFromSpec } from "@/lib/remix-render";
import type {
  RemixSpec,
  ResolvedRemixClip,
  ResolvedRemixVo,
} from "@/lib/remix-spec";

loadLocalEnv();

const execFileAsync = promisify(execFile);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function slugFromUrl(url: string): string {
  const m = url.match(/video\/(\d+)/);
  return m?.[1] ?? "segment";
}

async function fetchVideo(url: string, outMp4: string, workDir: string) {
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(outMp4), { recursive: true });
  const { stdout } = await execFileAsync(
    "python",
    [
      path.join(process.cwd(), "scripts", "fetch_video.py"),
      "--url",
      url,
      "--out",
      outMp4,
      "--work",
      workDir,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as { ok?: boolean; error?: string };
  if (!parsed.ok) {
    throw new Error(parsed.error ?? "Fetch failed.");
  }
}

async function backupOutputMp4(outputPath: string): Promise<void> {
  try {
    await readFile(outputPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await copyFile(outputPath, outputPath.replace(/\.mp4$/i, `.bak-${stamp}.mp4`));
  } catch {
    /* no prior file */
  }
}

async function resolveLipsyncClipsFromAssets(options: {
  assetsDir: string;
  plan: SegmentRemakePlan;
  outputDurationSec: number;
  probeVideoDurationSec: (p: string) => Promise<number | null>;
}): Promise<ResolvedRemixClip[]> {
  const { assetsDir, plan, outputDurationSec, probeVideoDurationSec } = options;
  const manifest = await readLipsyncClipManifest(assetsDir);
  const timeline = buildLipsyncTimelineEntries(
    plan,
    manifest,
    outputDurationSec,
  );
  const sourceDurationByFile = new Map<string, number>();
  for (const entry of timeline) {
    const localPath = path.join(assetsDir, entry.fileName);
    try {
      await readFile(localPath);
    } catch {
      console.warn("  Skip missing lip-sync asset:", entry.fileName);
      continue;
    }
    const sec = await probeVideoDurationSec(localPath);
    if (sec) sourceDurationByFile.set(entry.fileName, sec);
  }

  const resolved = lipsyncTimelineToResolvedClips(
    timeline.filter((e) => sourceDurationByFile.has(e.fileName)),
    assetsDir,
    sourceDurationByFile,
  );

  console.log(
    `  Lip-sync only (no base underlay): ${resolved.length} block(s), manifest ${manifest ? "yes" : "merged"}`,
  );
  return resolved;
}

async function trimVideo(
  input: string,
  output: string,
  sec: number,
  startSec = 0,
) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      ...(startSec > 0 ? ["-ss", String(startSec)] : []),
      "-i",
      input,
      "-t",
      String(sec),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      output,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

const MAX_CLIP_SEC = 8;

type VisualMode = "stable-loop" | "chain";

function getVisualMode(segmentSec: number): VisualMode {
  const env = (process.env.RECREATE_VISUAL_MODE ?? "").trim().toLowerCase();
  if (env === "chain") return "chain";
  if (env === "stable-loop") return "stable-loop";
  return segmentSec > MAX_CLIP_SEC ? "stable-loop" : "chain";
}

type AudioMode = "lipsync-segments" | "tts" | "evolink" | "source";

function getAudioMode(segmentSec: number): AudioMode {
  const env = (process.env.RECREATE_AUDIO ?? "").trim().toLowerCase();
  if (env === "source") return "source";
  if (env === "evolink") return "evolink";
  if (env === "tts") return "tts";
  if (env === "lipsync-segments") return "lipsync-segments";
  return segmentSec > MAX_CLIP_SEC ? "lipsync-segments" : "evolink";
}

function buildClipsFromPlan(
  plan: SegmentRemakePlan,
  phrase: string,
  bg: string,
  action: string,
  durationSec: number,
): RemixSpec["clips"] {
  const continuityLock = buildVisualContinuityLock(plan);
  const words = plan.transcriptWords;
  const segments = plan.transcriptSegments ?? [];

  const basePrompt = (spoken: string, clipIndex: number, totalClips: number) =>
    buildLucaSpeakingVideoPrompt({
      background: bg,
      action,
      spoken,
      clipIndex,
      totalClips,
      continuityLock,
    });

  if (durationSec > MAX_CLIP_SEC && (words?.length || segments.length)) {
    const { clips } = splitTranscriptForClips(
      segments,
      durationSec,
      MAX_CLIP_SEC,
      words,
    );
    const totalClips = clips.length;
    return clips.map((c, clipIndex) => ({
      type: "ai-video" as const,
      prompt: basePrompt(c.spoken, clipIndex, totalClips),
      durationSec: Math.min(MAX_CLIP_SEC, c.durationSec),
    }));
  }

  if (durationSec <= MAX_CLIP_SEC) {
    return [
      {
        type: "ai-video" as const,
        prompt: basePrompt(phrase, 0, 1),
        durationSec,
      },
    ];
  }

  const mid = Math.ceil(phrase.length / 2);
  const splitAt = phrase.indexOf(".", mid - 20);
  const cut = splitAt > 0 ? splitAt + 1 : mid;
  const partA = phrase.slice(0, cut).trim();
  const partB = phrase.slice(cut).trim();
  const durA = MAX_CLIP_SEC;
  const durB = Math.min(MAX_CLIP_SEC, durationSec - MAX_CLIP_SEC);
  return [
    {
      type: "ai-video" as const,
      prompt: basePrompt(partA, 0, 2),
      durationSec: durA,
    },
    {
      type: "ai-video" as const,
      prompt: basePrompt(partB || partA, 1, 2),
      durationSec: durB,
    },
  ];
}

function planToRemixSpec(
  plan: SegmentRemakePlan,
  segmentSec: number,
  visualMode: VisualMode,
): RemixSpec {
  const phrase = plan.spokenPhrase || plan.hook || "Hello.";
  const bg = plan.backgroundDescription || "clean indoor background";
  const action = plan.avatarAction || "friendly presenter energy";
  const continuityLock = buildVisualContinuityLock(plan);

  const durationSec = Math.min(segmentSec, plan.durationSec || segmentSec);

  let clips: RemixSpec["clips"];
  if (visualMode === "stable-loop" && durationSec > MAX_CLIP_SEC) {
    clips = [
      {
        type: "ai-video",
        prompt: buildLucaIdleLoopVideoPrompt({
          background: bg,
          action,
          continuityLock,
          setPlateTag: "@image4",
        }),
        durationSec,
      },
    ];
  } else {
    clips = buildClipsFromPlan(plan, phrase, bg, action, durationSec);
  }

  const overlays =
    plan.transcriptWords?.length && plan.transcriptSegments?.length
      ? buildOverlaysFromTranscript(
          plan,
          plan.transcriptSegments,
          plan.transcriptWords,
          durationSec,
        )
      : plan.textOverlays;

  return {
    characterId: "luca",
    clips,
    textOverlays: overlays.map((o) => ({
      text: o.text,
      startSec: o.startSec,
      endSec: Math.min(o.endSec, durationSec),
      position: o.position,
      ...(o.emphasis ? { emphasis: true } : {}),
      ...(o.color ? { color: o.color } : {}),
      ...(o.style ? { style: o.style } : {}),
      ...(o.fontSize ? { fontSize: o.fontSize } : {}),
    })),
    audio: [],
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec,
    },
    displayMode: "default",
  };
}

async function prepareSetPlateRef(
  segmentMp4: string,
  assetsDir: string,
  slug: string,
): Promise<string[]> {
  const localJpg = path.join(assetsDir, "set-plate.jpg");
  await extractSetPlateJpg(segmentMp4, localJpg, 1.2);
  const url = await publishSetPlateForEvoLink(localJpg, slug);
  return url ? [url] : [];
}

async function generateAvatarAssets(options: {
  spec: RemixSpec;
  plan: SegmentRemakePlan;
  assetsDir: string;
  segmentMp4: string;
  slug: string;
  visualMode: VisualMode;
  audioMode: AudioMode;
}): Promise<{ clips: ResolvedRemixClip[]; audio: ResolvedRemixVo[] }> {
  const model =
    (process.env.EVOLINK_LIPSYNC_MODEL ?? "").trim() ||
    "seedance-2.0-mini-reference-to-video";
  const { probeVideoDurationSec } = await import("@/lib/ffmpeg-transcode");

  const setPlateUrls = await prepareSetPlateRef(
    options.segmentMp4,
    options.assetsDir,
    options.slug,
  );
  if (setPlateUrls.length) {
    console.log("Set plate @image4 from source frame");
  } else {
    console.warn("No set plate URL (REMIX_LUCA_REF_BASE required for @image4).");
  }

  const resolved: ResolvedRemixClip[] = [];
  const speakAudio = options.audioMode === "evolink";
  const segmentSec = options.spec.output.durationSec;

  if (options.audioMode === "lipsync-segments") {
    const segments = options.plan.transcriptSegments ?? [];
    if (!segments.length) {
      throw new Error(
        "lipsync-segments requires transcript segments (no --no-transcribe).",
      );
    }

    console.log("  Lip-sync phrases only (no base-loop EvoLink job)…");
    await generateSegmentLipsyncClips({
      segments,
      plan: options.plan,
      assetsDir: options.assetsDir,
      setPlateUrls,
      model,
      timelineDurationSec: segmentSec,
    });

    const manifest = await readLipsyncClipManifest(options.assetsDir);
    const timeline = buildLipsyncTimelineEntries(
      options.plan,
      manifest,
      segmentSec,
    );
    const sourceDurationByFile = new Map<string, number>();
    for (const entry of timeline) {
      const p = path.join(options.assetsDir, entry.fileName);
      const sec = (await probeVideoDurationSec(p)) ?? undefined;
      if (sec) sourceDurationByFile.set(entry.fileName, sec);
    }
    return {
      clips: lipsyncTimelineToResolvedClips(
        timeline.filter((e) => sourceDurationByFile.has(e.fileName)),
        options.assetsDir,
        sourceDurationByFile,
      ),
      audio: [],
    };
  }

  if (
    options.visualMode === "stable-loop" &&
    options.spec.clips.length === 1 &&
    options.spec.clips[0].durationSec > MAX_CLIP_SEC
  ) {
    const clip = options.spec.clips[0];
    console.log(`  Stable loop: one ${MAX_CLIP_SEC}s take → ${clip.durationSec}s timeline…`);
    const taskId = await submitReferenceVideoTaskWithOptions({
      prompt: clip.prompt,
      durationSec: MAX_CLIP_SEC,
      exactDuration: true,
      generateAudio: false,
      model,
      additionalImageUrls: setPlateUrls,
    });
    const url = await waitForTaskResult(taskId);
    const localPath = path.join(options.assetsDir, "avatar-0.mp4");
    await downloadToFile(url, localPath);
    await ensureH264Mp4(localPath, { keepAudio: false });
    const sourceDurationSec = (await probeVideoDurationSec(localPath)) ?? MAX_CLIP_SEC;
    resolved.push({
      ...clip,
      localPath,
      sourceDurationSec,
    });
  } else {
    let extraRefs = [...setPlateUrls];
    for (let index = 0; index < options.spec.clips.length; index++) {
      const clip = options.spec.clips[index];
      console.log(`  Clip ${index + 1}/${options.spec.clips.length} (${clip.durationSec}s)…`);
      const taskId = await submitReferenceVideoTaskWithOptions({
        prompt: clip.prompt,
        durationSec: Math.min(MAX_CLIP_SEC, clip.durationSec),
        exactDuration: true,
        generateAudio: speakAudio,
        model,
        additionalImageUrls: extraRefs,
      });
      const url = await waitForTaskResult(taskId);
      const localPath = path.join(options.assetsDir, `avatar-${index}.mp4`);
      await downloadToFile(url, localPath);
      await ensureH264Mp4(localPath, { keepAudio: speakAudio });
      const sourceDurationSec = (await probeVideoDurationSec(localPath)) ?? undefined;
      resolved.push({
        ...clip,
        localPath,
        ...(sourceDurationSec ? { sourceDurationSec } : {}),
      });

      if (index === 0 && options.spec.clips.length > 1) {
        const tailJpg = path.join(options.assetsDir, "clip0-lastframe.jpg");
        await extractSetPlateJpg(localPath, tailJpg, 7.6);
        const tailUrl = await publishRecreatePlate(
          tailJpg,
          `${options.slug}-clip0-tail.jpg`,
        );
        extraRefs = [...setPlateUrls, ...(tailUrl ? [tailUrl] : [])];
      }
    }
  }

  let audio: ResolvedRemixVo[] = [];
  if (options.audioMode === "tts") {
    const segments = options.plan.transcriptSegments ?? [];
    if (!segments.length) {
      throw new Error("TTS audio requires transcript segments (run without --no-transcribe).");
    }
    console.log(`  TTS: ${segments.length} phrase track(s) (EvoLink Qwen)…`);
    audio = await generateTtsVoTracksFromSegments(segments, options.assetsDir);
  } else if (options.audioMode === "source") {
    const { extractSegmentAudioAac } = await import("@/lib/segment-source-audio");
    const aacPath = path.join(options.assetsDir, "source-segment.aac");
    await extractSegmentAudioAac(options.segmentMp4, aacPath);
    audio.push({
      type: "vo",
      text: options.plan.spokenPhrase || "segment",
      startSec: 0,
      localPath: aacPath,
    });
    console.log("Audio: reference segment (RECREATE_AUDIO=source only)");
  }

  return { clips: resolved, audio };
}

async function main() {
  const url = argValue("--url");
  const resumeOnly = process.argv.includes("--resume");
  const resumeRenderOnly = process.argv.includes("--resume-render");
  if (!url) {
    throw new Error(
      "Usage: tsx scripts/recreate-segment.ts --url <url> [--sec 4] [--resume]",
    );
  }
  const maxSegmentSec = Math.min(
    20,
    Math.max(3, parseInt(process.env.RECREATE_MAX_SEC ?? "20", 10) || 20),
  );
  const segmentSec = Math.min(
    maxSegmentSec,
    Math.max(3, parseInt(argValue("--sec") ?? "4", 10) || 4),
  );
  const outputDurationSec = getRecreateOutputDurationSec(segmentSec);
  const startSec = Math.max(0, parseFloat(argValue("--start") ?? "0") || 0);
  const skipFetch = process.argv.includes("--skip-fetch");
  const skipTranscribe = process.argv.includes("--no-transcribe");

  const slug = slugFromUrl(url);
  const outDir = path.join(process.cwd(), "out", "recreate", slug);
  const sourceMp4 = path.join(outDir, "source.mp4");
  const segmentMp4 = path.join(
    outDir,
    startSec > 0 ? `seg-${startSec}-${segmentSec}s.mp4` : `first-${segmentSec}s.mp4`,
  );
  const assetsDir = path.join(outDir, "assets");
  const planPath = path.join(
    outDir,
    startSec > 0 ? `segment-plan-${startSec}-${segmentSec}s.json` : `segment-plan-${segmentSec}s.json`,
  );

  let plan: SegmentRemakePlan;

  if (resumeOnly || resumeRenderOnly) {
    plan = JSON.parse(await readFile(planPath, "utf8")) as SegmentRemakePlan;
    console.log("Resume from", planPath);
    const transcriptPath = planPath.replace(/segment-plan/, "segment-transcript");
    try {
      const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
      plan = applyTranscriptToPlan(plan, transcript, outputDurationSec);
    } catch {
      /* no saved transcript */
    }
    if (resumeRenderOnly && !resumeOnly) {
      console.log(
        `Trim ${startSec}s + ${outputDurationSec}s (reference segment)…`,
      );
      await trimVideo(sourceMp4, segmentMp4, outputDurationSec, startSec);
    }
  } else {
    if (!skipFetch) {
      console.log("Fetch…", url);
      await fetchVideo(url, sourceMp4, path.join(outDir, "work"));
    }

    console.log(
      `Trim ${startSec}s + ${outputDurationSec}s` +
        (outputDurationSec < segmentSec
          ? ` (drop last ${segmentSec - outputDurationSec}s of ${segmentSec}s window)`
          : "") +
        "…",
    );
    await trimVideo(sourceMp4, segmentMp4, outputDurationSec, startSec);

    console.log("Analyze segment (vision — overlays + set)…");
    const analyzed = await analyzeSegmentRemake(segmentMp4, outputDurationSec);
    if (!analyzed.ok) throw new Error(analyzed.error);
    plan = analyzed.plan;

    if (!skipTranscribe) {
      console.log("Transcribe segment (ASR on audio)…");
      const tr = await transcribeSegmentVideo(segmentMp4, outputDurationSec);
      if (tr.ok) {
        plan = applyTranscriptToPlan(plan, tr.transcript, outputDurationSec);
        const transcriptPath = planPath.replace(
          /segment-plan/,
          "segment-transcript",
        );
        await writeFile(
          transcriptPath,
          `${JSON.stringify(tr.transcript, null, 2)}\n`,
          "utf8",
        );
        console.log("ASR:", tr.transcript.fullText.slice(0, 120) + "…");
        console.log(
          "Words:",
          tr.transcript.words.length,
          "| Segments:",
          tr.transcript.segments.length,
        );
      } else {
        console.warn("Transcribe skipped:", tr.error);
      }
    }

    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    console.log("Plan:", plan.hook || plan.spokenPhrase);
    console.log("Overlays:", plan.textOverlays.length);
  }

  const visualMode = getVisualMode(outputDurationSec);
  const audioMode = getAudioMode(outputDurationSec);
  console.log("Mode:", visualMode, "| Audio:", audioMode);

  const spec = planToRemixSpec(plan, outputDurationSec, visualMode);
  await writeFile(
    path.join(outDir, "remix-spec.json"),
    `${JSON.stringify(spec, null, 2)}\n`,
    "utf8",
  );

  await mkdir(assetsDir, { recursive: true });
  let resolvedClips: ResolvedRemixClip[];
  let resolvedAudio: ResolvedRemixVo[] = [];
  if (resumeRenderOnly) {
    console.log("Resume render only (existing avatar clips)…");
    const { probeVideoDurationSec } = await import("@/lib/ffmpeg-transcode");

    if (audioMode === "lipsync-segments") {
      resolvedClips = [];
    } else {
      resolvedClips = await Promise.all(
        spec.clips.map(async (clip, index) => {
          const localPath = path.join(assetsDir, `avatar-${index}.mp4`);
          await readFile(localPath);
          await ensureH264Mp4(localPath, { keepAudio: audioMode === "evolink" });
          const sourceDurationSec = (await probeVideoDurationSec(localPath)) ?? undefined;
          return { ...clip, localPath, ...(sourceDurationSec ? { sourceDurationSec } : {}) };
        }),
      );
    }
    const aacPath = path.join(assetsDir, "source-segment.aac");
    try {
      await readFile(aacPath);
      if (audioMode === "source") {
        resolvedAudio = [
          {
            type: "vo",
            text: plan.spokenPhrase || "segment",
            startSec: 0,
            localPath: aacPath,
          },
        ];
      }
    } catch {
      /* no source audio */
    }
    if (audioMode === "tts") {
      const { readdir } = await import("node:fs/promises");
      const names = await readdir(assetsDir);
      const ttsFiles = names.filter((n) => n.startsWith("tts-") && n.endsWith(".mp3")).sort();
      const segments = plan.transcriptSegments ?? [];
      resolvedAudio = ttsFiles.map((name, i) => ({
        type: "vo" as const,
        text: segments[i]?.text ?? name,
        startSec: segments[i]?.startSec ?? 0,
        localPath: path.join(assetsDir, name),
      }));
    }
    if (audioMode === "lipsync-segments") {
      resolvedClips = await resolveLipsyncClipsFromAssets({
        assetsDir,
        plan,
        outputDurationSec,
        probeVideoDurationSec,
      });
    }
  } else {
    console.log("Generate Luca visual (EvoLink mini, 720p)…");
    const gen = await generateAvatarAssets({
      spec,
      plan,
      assetsDir,
      segmentMp4,
      slug,
      visualMode,
      audioMode,
    });
    resolvedClips = gen.clips;
    resolvedAudio = gen.audio;
  }

  if (
    (visualMode === "stable-loop" && resolvedClips.length === 1) ||
    audioMode === "lipsync-segments"
  ) {
    spec.output.durationSec = outputDurationSec;
  } else {
    const timelineSec = resolvedClips.reduce((s, c) => s + c.durationSec, 0);
    spec.output.durationSec = Math.min(outputDurationSec, timelineSec);
  }
  spec.clips = resolvedClips.map(
    ({ localPath: _p, sourceDurationSec: _s, ...rest }) => rest,
  );

  const resolved = {
    ...spec,
    clips: resolvedClips,
    audio: resolvedAudio,
  };

  const outputPath = path.join(outDir, `remake-${segmentSec}s.mp4`);
  await backupOutputMp4(outputPath);

  console.log("Remotion composite…");
  const { outputPath: renderedPath } = await renderRemixFromSpec({
    spec,
    workDir: outDir,
    assetsSubdir: "assets",
    outputFileName: `remake-${segmentSec}s.mp4`,
    resolved,
    onPhase: async (p) => console.log(p === "rendering" ? "Rendering…" : "…"),
  });

  console.log("\nDone:", renderedPath);
  console.log("Review:", segmentMp4, "(original segment)");
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

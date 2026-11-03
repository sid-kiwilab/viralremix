import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import {
  exportRemotionSafeClip,
  probeVideoDurationSec,
} from "@/lib/ffmpeg-transcode";
import { generateRemixAssets } from "@/lib/evolink";
import { startLocalAssetServer } from "@/lib/local-asset-server";
import { toRemotionInputProps } from "@/lib/remotion-input";
import type { RemixSpec, ResolvedRemixSpec } from "@/lib/remix-spec";

const COMPOSITION_ID = "Remix";

export type RemixRenderPhase = "generating" | "rendering";

export type RenderRemixOptions = {
  spec: RemixSpec;
  workDir: string;
  projectRoot?: string;
  assetsSubdir?: string;
  outputFileName?: string;
  /** Skip EvoLink when assets were already generated (e.g. retry Remotion only). */
  resolved?: ResolvedRemixSpec;
  onPhase?: (phase: RemixRenderPhase) => void | Promise<void>;
};

export async function renderRemixFromSpec(
  options: RenderRemixOptions,
): Promise<{ outputPath: string }> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const assetsDir = path.join(
    options.workDir,
    options.assetsSubdir ?? "assets",
  );
  const outputPath = path.join(
    options.workDir,
    options.outputFileName ?? "remix.mp4",
  );

  await mkdir(options.workDir, { recursive: true });

  let resolved: ResolvedRemixSpec;
  if (options.resolved) {
    resolved = options.resolved;
  } else {
    await options.onPhase?.("generating");
    resolved = await generateRemixAssets(options.spec, assetsDir);
  }

  resolved = {
    ...resolved,
    clips: await Promise.all(
      resolved.clips.map(async (clip) => {
        if (clip.sourceDurationSec) return clip;
        const sourceDurationSec = await probeVideoDurationSec(clip.localPath);
        return sourceDurationSec ? { ...clip, sourceDurationSec } : clip;
      }),
    ),
  };

  await writeFile(
    path.join(options.workDir, "remix-resolved.json"),
    `${JSON.stringify(resolved, null, 2)}\n`,
    "utf8",
  );

  const remotionClipsDir = path.join(options.workDir, "remotion-clips");
  await mkdir(remotionClipsDir, { recursive: true });
  const prepared: ResolvedRemixSpec = {
    ...resolved,
    clips: await Promise.all(
      resolved.clips.map(async (clip, index) => {
        const safePath = path.join(remotionClipsDir, `clip-${index}.mp4`);
        const keepAudio = clip.muteEmbeddedAudio === false;
        await exportRemotionSafeClip(
          clip.localPath,
          safePath,
          clip.durationSec,
          keepAudio,
        );
        const sourceDurationSec =
          (await probeVideoDurationSec(safePath)) ?? clip.durationSec;
        return {
          ...clip,
          localPath: safePath,
          sourceDurationSec,
        };
      }),
    ),
  };

  const assetServer = await startLocalAssetServer(remotionClipsDir);
  const inputProps = toRemotionInputProps(prepared, assetServer.baseUrl);

  await options.onPhase?.("rendering");
  const entryPoint = path.join(projectRoot, "remotion", "index.ts");
  let serveUrl: string;
  try {
    serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(typeof config.resolve.alias === "object" && config.resolve.alias
          ? config.resolve.alias
          : {}),
        "@": path.resolve(projectRoot),
      };
      return config;
    },
    });
  } catch (err) {
    await assetServer.close();
    throw err;
  }

  try {
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
    });
  } finally {
    await assetServer.close();
  }

  return { outputPath };
}

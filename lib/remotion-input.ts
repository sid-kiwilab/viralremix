import path from "node:path";
import { getEvoLinkBillableDurationSec } from "@/lib/evolink-video-config";
import type { ResolvedRemixSpec } from "@/lib/remix-spec";
import type { RemixCompositionProps } from "@/remotion/RemixComposition";

function assetSrc(localPath: string, assetsBaseUrl: string): string {
  const base = assetsBaseUrl.replace(/\/$/, "");
  return `${base}/${path.basename(localPath)}`;
}

export function toRemotionInputProps(
  resolved: ResolvedRemixSpec,
  assetsBaseUrl: string,
): RemixCompositionProps {
  const { fps } = resolved.output;
  let chainFrom = 0;
  const hasAbsolutePlacement = resolved.clips.some(
    (c) => c.timelineStartSec !== undefined,
  );
  const embeddedAudioTracks: RemixCompositionProps["embeddedAudioTracks"] = [];
  const clips: RemixCompositionProps["clips"] = [];
  for (const clip of resolved.clips) {
    const billedSec = getEvoLinkBillableDurationSec(clip.durationSec);
    const sourceSec = clip.sourceDurationSec ?? billedSec;
    const maxFramesFromSource = Math.max(
      1,
      Math.floor(sourceSec * fps) - 1,
    );
    let durationInFrames = Math.max(1, Math.round(clip.durationSec * fps));
    durationInFrames = Math.min(durationInFrames, maxFramesFromSource);
    const loopDurationInFrames =
      sourceSec < clip.durationSec
        ? Math.max(1, Math.round(sourceSec * fps))
        : undefined;
    const from = hasAbsolutePlacement
      ? Math.max(0, Math.round((clip.timelineStartSec ?? 0) * fps))
      : chainFrom;
    const src = assetSrc(clip.localPath, assetsBaseUrl);
    const fromFrames = from;

    if (clip.muteEmbeddedAudio === false) {
      embeddedAudioTracks.push({
        src,
        from: fromFrames,
        durationInFrames,
      });
    }

    /** Repeat short EvoLink takes on timeline without Remotion `<Loop>` (Windows seek bugs). */
    if (loopDurationInFrames && durationInFrames > loopDurationInFrames) {
      let offset = 0;
      while (offset < durationInFrames) {
        const segFrames = Math.min(
          loopDurationInFrames,
          durationInFrames - offset,
        );
        clips.push({
          src,
          from: from + offset,
          durationInFrames: segFrames,
          muteEmbeddedAudio: true,
        });
        offset += segFrames;
      }
    } else {
      clips.push({
        src,
        from,
        durationInFrames,
        ...(loopDurationInFrames ? { loopDurationInFrames } : {}),
        muteEmbeddedAudio: true,
      });
    }

    if (!hasAbsolutePlacement) {
      chainFrom += durationInFrames;
    }
  }

  const textOverlays = resolved.textOverlays.map((overlay) => ({
    text: overlay.text,
    from: Math.max(0, Math.round(overlay.startSec * fps)),
    durationInFrames: Math.max(
      1,
      Math.round((overlay.endSec - overlay.startSec) * fps),
    ),
    position: overlay.position,
    ...(overlay.emphasis !== undefined ? { emphasis: overlay.emphasis } : {}),
    ...(overlay.color ? { color: overlay.color } : {}),
    ...(overlay.style ? { style: overlay.style } : {}),
    ...(overlay.fontSize ? { fontSize: overlay.fontSize } : {}),
  }));

  const voTracks = resolved.audio.map((track) => ({
    src: assetSrc(track.localPath, assetsBaseUrl),
    from: Math.max(0, Math.round(track.startSec * fps)),
  }));

  const lessonCharacters =
    resolved.lessonCharacters ??
    resolved.textOverlays.map((o) => o.text).filter(Boolean);

  return {
    output: resolved.output,
    clips,
    textOverlays,
    vo: voTracks[0] ?? null,
    voTracks,
    embeddedAudioTracks,
    lessonCharacters,
    displayMode: resolved.displayMode ?? "default",
  };
}

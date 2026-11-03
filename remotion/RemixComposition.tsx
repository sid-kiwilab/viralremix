import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadNotoKr } from "@remotion/google-fonts/NotoSansKR";
import type { TextOverlayPosition } from "@/lib/remix-spec";
import { TurkishFlagBadge } from "@/remotion/TurkishFlagBadge";

const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

const { fontFamily: notoKrFamily } = loadNotoKr("normal", {
  weights: ["700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export type RemixCompositionClip = {
  src: string;
  from: number;
  durationInFrames: number;
  /** When EvoLink clip is shorter than the timeline, loop this many frames. */
  loopDurationInFrames?: number;
  muteEmbeddedAudio?: boolean;
};

export type RemixCompositionOverlay = {
  text: string;
  from: number;
  durationInFrames: number;
  position: TextOverlayPosition;
  emphasis?: boolean;
  color?: string;
  style?: "header-pill" | "caption-yellow" | "word-hero" | "plain";
  fontSize?: "large" | "medium";
};

export type RemixCompositionVo = {
  src: string;
  from: number;
};

/** AI lip-sync audio only — video stays muted so tracks never stack. */
export type RemixCompositionEmbeddedAudio = {
  src: string;
  from: number;
  durationInFrames: number;
};

export type RemixCompositionProps = {
  output: {
    width: 1080;
    height: 1920;
    fps: 30;
    durationSec: number;
  };
  clips: RemixCompositionClip[];
  textOverlays: RemixCompositionOverlay[];
  /** @deprecated single track — prefer voTracks */
  vo: RemixCompositionVo | null;
  voTracks: RemixCompositionVo[];
  embeddedAudioTracks?: RemixCompositionEmbeddedAudio[];
  lessonCharacters: string[];
  displayMode: "default" | "character-strip";
};

function overlayBlockStyle(
  overlay: RemixCompositionOverlay,
  useKorean: boolean,
): React.CSSProperties {
  const position = overlay.position;
  const emphasis = overlay.emphasis ?? false;
  const styleKind = overlay.style ?? "plain";
  const color = overlay.color;

  const sizeLarge = overlay.fontSize === "large";

  if (styleKind === "header-pill") {
    return {
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      top: "6%",
      fontFamily: interFamily,
      fontSize: sizeLarge ? 34 : 30,
      fontWeight: 700,
      color: color ?? "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.92)",
      borderRadius: 14,
      padding: "10px 20px 10px 14px",
      textAlign: "center",
      maxWidth: "88%",
      whiteSpace: "nowrap",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxSizing: "border-box",
    };
  }

  if (styleKind === "caption-yellow") {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      boxSizing: "border-box",
      fontFamily: interFamily,
      fontSize: sizeLarge ? 38 : 32,
      fontWeight: 800,
      color: color ?? "#FFE135",
      textAlign: "center",
      WebkitTextStroke: "2px #000000",
      paintOrder: "stroke fill",
      textShadow: "0 2px 0 #000, 0 0 10px rgba(0,0,0,0.9)",
      padding: "0 7%",
      lineHeight: 1.22,
      bottom: "13.5%",
      maxWidth: "100%",
    };
  }

  if (styleKind === "word-hero") {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      top: "42%",
      transform: "translateY(-50%)",
      fontFamily: interFamily,
      fontSize: sizeLarge ? 92 : 76,
      fontWeight: 800,
      color: color ?? "#FFFFFF",
      textAlign: "center",
      WebkitTextStroke: "2.5px #000000",
      paintOrder: "stroke fill",
      textShadow: "0 3px 20px rgba(0,0,0,0.8)",
      padding: "0 5%",
      letterSpacing: "-0.02em",
    };
  }

  return overlayStyle(position, emphasis, useKorean, color);
}

function headerShowsTurkishFlag(title: string): boolean {
  return /turkish|türk|turkce|türkçe|basics/i.test(title);
}

function OverlayText({
  overlay,
  useKorean,
}: {
  overlay: RemixCompositionOverlay;
  useKorean: boolean;
}) {
  const styleKind = overlay.style ?? "plain";
  const blockStyle = overlayBlockStyle(overlay, useKorean);

  if (styleKind === "header-pill") {
    const title = overlay.text.trim();
    const showFlag = headerShowsTurkishFlag(title);
    return (
      <div style={blockStyle}>
        {showFlag ? <TurkishFlagBadge height={38} /> : null}
        <span>{title}</span>
      </div>
    );
  }

  return <div style={blockStyle}>{overlay.text}</div>;
}

function overlayStyle(
  position: TextOverlayPosition,
  emphasis: boolean,
  useKorean: boolean,
  color?: string,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    boxSizing: "border-box",
    fontFamily: useKorean ? notoKrFamily : interFamily,
    color: color ?? (emphasis ? "#4ade80" : "#ffffff"),
    fontSize: emphasis ? 88 : 52,
    fontWeight: 700,
    textAlign: "center",
    textShadow: emphasis
      ? "0 0 24px rgba(74, 222, 128, 0.55), 0 2px 16px rgba(0,0,0,0.75)"
      : "0 2px 16px rgba(0,0,0,0.75)",
    padding: "0 8%",
    lineHeight: 1.15,
    maxWidth: "100%",
    margin: "0 auto",
  };
  switch (position) {
    case "top":
      return { ...base, top: "12%" };
    case "bottom":
      return { ...base, bottom: "14%" };
    default:
      return { ...base, top: "50%", transform: "translateY(-50%)" };
  }
}

function CharacterStrip({
  characters,
  textOverlays,
  fps,
}: {
  characters: string[];
  textOverlays: RemixCompositionOverlay[];
  fps: number;
}) {
  const frame = useCurrentFrame();
  const timeSec = frame / fps;

  let activeIndex = 0;
  for (let i = 0; i < textOverlays.length; i++) {
    const start = textOverlays[i].from / fps;
    const end = start + textOverlays[i].durationInFrames / fps;
    if (timeSec >= start && timeSec < end) {
      activeIndex = i;
      break;
    }
    if (timeSec >= end) activeIndex = Math.min(i + 1, characters.length - 1);
  }

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: "center",
        alignItems: "center",
        top: "42%",
        height: "18%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.35em 0.5em",
          maxWidth: "92%",
          fontFamily: notoKrFamily,
        }}
      >
        {characters.map((char, index) => {
          const active = index === activeIndex;
          return (
            <span
              key={`${char}-${index}`}
              style={{
                fontSize: active ? 72 : 44,
                fontWeight: 700,
                color: active ? "#4ade80" : "rgba(255,255,255,0.42)",
                textShadow: active
                  ? "0 0 20px rgba(74, 222, 128, 0.5)"
                  : "none",
                transform: active ? "scale(1.08)" : "scale(1)",
                transition: "color 0.05s linear",
              }}
            >
              {char}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export const RemixComposition: React.FC<RemixCompositionProps> = ({
  clips,
  textOverlays,
  vo,
  voTracks,
  embeddedAudioTracks = [],
  lessonCharacters,
  displayMode,
  output,
}) => {
  const stripMode =
    displayMode === "character-strip" && lessonCharacters.length >= 2;
  const allVo = voTracks.length > 0 ? voTracks : vo ? [vo] : [];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {clips.map((clip, index) => (
        <Sequence
          key={`clip-${index}`}
          from={clip.from}
          durationInFrames={clip.durationInFrames}
        >
          <AbsoluteFill>
            {clip.loopDurationInFrames && clip.loopDurationInFrames > 0 ? (
              <Loop durationInFrames={clip.loopDurationInFrames}>
                <OffthreadVideo
                  src={clip.src}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  muted
                />
              </Loop>
            ) : (
              <OffthreadVideo
                src={clip.src}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                muted
              />
            )}
          </AbsoluteFill>
        </Sequence>
      ))}

      {stripMode ? (
        <CharacterStrip
          characters={lessonCharacters}
          textOverlays={textOverlays}
          fps={output.fps}
        />
      ) : (
        textOverlays.map((overlay, index) => (
          <Sequence
            key={`overlay-${index}`}
            from={overlay.from}
            durationInFrames={overlay.durationInFrames}
          >
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <OverlayText
                overlay={overlay}
                useKorean={/[\u3131-\uD79D]/.test(overlay.text)}
              />
            </AbsoluteFill>
          </Sequence>
        ))
      )}

      {embeddedAudioTracks.map((track, index) => (
        <Sequence
          key={`lip-audio-${index}`}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <Audio src={track.src} />
        </Sequence>
      ))}

      {allVo.map((track, index) => (
        <Sequence key={`vo-${index}`} from={track.from} layout="none">
          <Audio src={track.src} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

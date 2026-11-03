import { Composition } from "remotion";
import {
  RemixComposition,
  type RemixCompositionProps,
} from "./RemixComposition";

const defaultProps: RemixCompositionProps = {
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 8,
  },
  clips: [],
  textOverlays: [],
  vo: null,
  voTracks: [],
  lessonCharacters: [],
  displayMode: "default",
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Remix"
      component={RemixComposition}
      durationInFrames={240}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          1,
          Math.ceil(props.output.durationSec * props.output.fps),
        ),
        fps: props.output.fps,
        width: props.output.width,
        height: props.output.height,
      })}
    />
  );
};

import { Composition, type CalculateMetadataFunction } from 'remotion';
import { clipDurationMs, normalizeClips } from '@/lib/sim.types';
import { LessonVideo, type LessonVideoProps } from './LessonVideo';

export const LESSON_VIDEO_FPS = 30;
export const LESSON_VIDEO_COMPOSITION_ID = 'LessonVideo';

const DEFAULT_PROPS: LessonVideoProps = {
  deck: [],
  events: [],
  durationMs: 60_000,
  clipSegments: null,
  audioUrl: null,
  language: 'ar',
};

// Video length = sim duration minus the total cut time, in frames.
const calculateMetadata: CalculateMetadataFunction<LessonVideoProps> = ({
  props,
}) => {
  const clips = normalizeClips(props.clipSegments);
  const virtualMs = Math.max(0, props.durationMs - clipDurationMs(clips));
  return {
    durationInFrames: Math.max(1, Math.ceil((virtualMs / 1000) * LESSON_VIDEO_FPS)),
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={LESSON_VIDEO_COMPOSITION_ID}
      component={LessonVideo}
      durationInFrames={LESSON_VIDEO_FPS * 60}
      fps={LESSON_VIDEO_FPS}
      width={1280}
      height={720}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={calculateMetadata}
    />
  );
};

import type { ReactNode } from 'react';
import type { Slide, SlideEntranceAnimation } from '@/lib/slides.types';
import type { InteractionAnswer } from '@/lib/interactions/types';
import TitleSlide from './templates/TitleSlide';
import ContentSlide from './templates/ContentSlide';
import KeyPointsSlide from './templates/KeyPointsSlide';
import DiagramSlide from './templates/DiagramSlide';
import ActivitySlide from './templates/ActivitySlide';
import QuizPreviewSlide from './templates/QuizPreviewSlide';
import QuestionAnswerSlide from './templates/QuestionAnswerSlide';
import SummarySlide from './templates/SummarySlide';
import WhiteboardSlide from './templates/WhiteboardSlide';
import ExplorationSlide from './templates/ExplorationSlide';

interface SlideCardProps {
  slide: Slide;
  language: 'ar' | 'en';
  className?: string;
  revealedCount?: number;
  onReveal?: () => void;
  renderMode?: 'default' | 'thumbnail';
  showActivityAnswer?: boolean;
  /**
   * Turn the activity slide's DnD widget on (teacher present mode, sim
   * recording, sim replay). When false, the static `InteractionPreview` is
   * rendered so editor canvases and thumbnails stay non-interactive.
   */
  activityInteractive?: boolean;
  activityAnswer?: InteractionAnswer | null;
  onActivityAnswerChange?: (answer: InteractionAnswer) => void;
  activityInteractiveDisabled?: boolean;
  /** Fired when an exploration widget is completed. */
  onExplorationComplete?: () => void;
  /** Strip rounded corners and shadow — used by SimPlayer for edge-to-edge slides. */
  chromeless?: boolean;
  /**
   * When true, the outer wrapper replays `slide.entrance_animation` each time
   * the slide id changes. Set by present mode and sim replay; off in editor
   * canvas/thumbnails.
   */
  applyEntranceAnimation?: boolean;
}

function getEntranceAnimationClass(anim: SlideEntranceAnimation | null | undefined): string {
  switch (anim) {
    case 'fade':
      return 'slide-entrance-fade';
    case 'slide_up':
      return 'slide-entrance-slide-up';
    case 'pop':
      return 'slide-entrance-pop';
    default:
      return '';
  }
}

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const THUMBNAIL_WIDTH = 176;
const THUMBNAIL_HEIGHT = Math.round((THUMBNAIL_WIDTH * DESIGN_HEIGHT) / DESIGN_WIDTH);

export default function SlideCard({
  slide,
  language,
  className = '',
  revealedCount,
  onReveal,
  renderMode = 'default',
  showActivityAnswer = false,
  activityInteractive = false,
  activityAnswer,
  onActivityAnswerChange,
  activityInteractiveDisabled = false,
  onExplorationComplete,
  chromeless = false,
  applyEntranceAnimation = false,
}: SlideCardProps) {
  let renderedContent: ReactNode;

  // `revealedCount` is only meaningful for `question_answer` (always) and for
  // `key_points`/`summary`/`content` slides that have opted into
  // `progressive_reveal`. Gating here means templates can trust a single
  // source of truth instead of re-checking `slide.progressive_reveal`, and
  // also protects SimPlayer — which passes `revealed_bullets = 0` by default
  // — from collapsing non-progressive slides to their first item.
  const progressiveReveal = !!slide.progressive_reveal;
  const progressiveRevealedCount = progressiveReveal ? revealedCount : undefined;
  const progressiveOnReveal = progressiveReveal ? onReveal : undefined;

  switch (slide.type) {
    case 'question_answer':
      renderedContent = (
        <QuestionAnswerSlide
          slide={slide}
          language={language}
          revealedCount={revealedCount}
          onReveal={onReveal}
        />
      );
      break;
    case 'title':
      renderedContent = <TitleSlide slide={slide} language={language} />;
      break;
    case 'content':
      renderedContent = (
        <ContentSlide
          slide={slide}
          language={language}
          revealedCount={progressiveRevealedCount}
        />
      );
      break;
    case 'key_points':
      renderedContent = (
        <KeyPointsSlide
          slide={slide}
          language={language}
          revealedCount={progressiveRevealedCount}
          onReveal={progressiveOnReveal}
        />
      );
      break;
    case 'diagram_description':
      renderedContent = <DiagramSlide slide={slide} language={language} />;
      break;
    case 'activity':
      renderedContent = (
        <ActivitySlide
          slide={slide}
          language={language}
          showAnswer={showActivityAnswer}
          interactive={activityInteractive && renderMode !== 'thumbnail'}
          interactiveAnswer={activityAnswer}
          onInteractiveAnswerChange={onActivityAnswerChange}
          interactiveDisabled={activityInteractiveDisabled}
        />
      );
      break;
    case 'quiz_preview':
      renderedContent = <QuizPreviewSlide slide={slide} language={language} />;
      break;
    case 'whiteboard':
      renderedContent = <WhiteboardSlide slide={slide} language={language} />;
      break;
    case 'exploration':
      renderedContent = (
        <ExplorationSlide
          slide={slide}
          language={language}
          interactive={activityInteractive && renderMode !== 'thumbnail'}
          onComplete={onExplorationComplete}
        />
      );
      break;
    case 'summary':
      renderedContent = (
        <SummarySlide
          slide={slide}
          language={language}
          revealedCount={progressiveRevealedCount}
          onReveal={progressiveOnReveal}
        />
      );
      break;
    default:
      renderedContent = <SummarySlide slide={slide} language={language} />;
      break;
  }

  if (renderMode === 'thumbnail') {
    return (
      <div
        className={`rounded-2xl overflow-hidden shadow-lg bg-white ${className}`}
        style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
      >
        <div
          className="origin-top-left"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${THUMBNAIL_WIDTH / DESIGN_WIDTH})`,
          }}
        >
          {renderedContent}
        </div>
      </div>
    );
  }

  const entranceClass =
    applyEntranceAnimation && slide.entrance_animation && slide.entrance_animation !== 'none'
      ? getEntranceAnimationClass(slide.entrance_animation)
      : '';

  // Entrance-animation replay is driven by caller-site `key={slide.id}` on
  // the <SlideCard> element (see SlideEditor / SimPlayer), which forces a
  // remount of this wrapper whenever the active slide changes. A `key` on
  // the root element returned from a component has no effect — React only
  // reconciles keys among siblings in the parent's children array.
  return (
    <div
      className={`aspect-video overflow-hidden bg-white ${chromeless ? '' : 'rounded-2xl shadow-lg'} ${entranceClass} ${className}`}
    >
      {renderedContent}
    </div>
  );
}

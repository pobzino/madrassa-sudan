import type { ReactNode } from 'react';
import type { Slide } from '@/lib/slides.types';
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
}: SlideCardProps) {
  let renderedContent: ReactNode;

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
      renderedContent = <ContentSlide slide={slide} language={language} />;
      break;
    case 'key_points':
      renderedContent = <KeyPointsSlide slide={slide} language={language} />;
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
    case 'summary':
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

  return (
    <div className={`aspect-video rounded-2xl overflow-hidden shadow-lg bg-white ${className}`}>
      {renderedContent}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Joyride,
  type EventData,
  type Controls,
  type Step,
  type TooltipRenderProps,
  STATUS,
  EVENTS,
  ACTIONS,
} from 'react-joyride';
import { useTourState } from '@/hooks/useTourState';

// ── Tour step definitions ───────────────────────────────────────────────────

type TourSegment = 'lesson-list' | 'lesson-editor' | 'sim-recording' | 'post-recording';

const SEGMENT_ORDER: TourSegment[] = [
  'lesson-list',
  'lesson-editor',
  'sim-recording',
  'post-recording',
];

interface TourStep extends Step {
  data?: { segment: TourSegment };
}

const ALL_STEPS: TourStep[] = [
  // ── Segment 1: Lesson List ──────────────────────────────────────────────
  {
    target: '[data-tour="new-lesson-btn"]',
    title: 'Create a New Lesson',
    content:
      'Click here to create a new lesson. You\'ll pick a subject, grade level, and curriculum topic — then the AI generates your slide deck.',
    placement: 'bottom',
    skipBeacon: true,
    spotlightClicks: true,
    data: { segment: 'lesson-list' },
  },
  {
    target: '[data-tour="quick-create-modal"]',
    title: 'Fill In Lesson Details',
    content:
      'Enter a learning objective and key ideas. The more detail you give, the better the generated slides will be.',
    placement: 'right',
    skipBeacon: true,
    data: { segment: 'lesson-list' },
  },
  {
    target: '[data-tour="lesson-length-preset"]',
    title: 'Choose Lesson Length',
    content:
      'Pick how long the lesson should be — short (5 min), standard (15 min), or extended (30 min). This controls how many slides are generated.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'lesson-list' },
  },
  {
    target: '[data-tour="create-draft-btn"]',
    title: 'Generate Your Slides',
    content:
      'Click here to create the lesson draft and auto-generate your presentation slides. You\'ll be taken to the slide editor next.',
    placement: 'top',
    skipBeacon: true,
    spotlightClicks: true,
    data: { segment: 'lesson-list' },
  },

  // ── Segment 2: Lesson Editor ────────────────────────────────────────────
  {
    target: '[data-tour="slides-tab"]',
    title: 'Your Slides',
    content:
      'This is the Slides tab — where you build your lesson. Slides are shown on the left, and you can edit each one on the right.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'lesson-editor' },
  },
  {
    target: '[data-tour="add-slide-btn"]',
    title: 'Add Slides',
    content:
      'Hover here to add new slides: Content, Key Points, Diagram, Q&A Reveal, Summary, or Whiteboard. Each type has a different layout.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'lesson-editor' },
  },
  {
    target: '[data-tour="add-interactive-btn"]',
    title: 'Add Interactive Activities',
    content:
      'Add slides where students answer during the lesson — multiple choice, drag-and-drop, matching pairs, fill-in-the-blank, and more.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'lesson-editor' },
  },
  {
    target: '[data-tour="speaker-notes"]',
    title: 'Speaker Notes',
    content:
      'Write your teaching notes here. They\'ll appear as prompts while you record, and students will see them as "Lesson Notes" during playback.',
    placement: 'left',
    skipBeacon: true,
    data: { segment: 'lesson-editor' },
  },
  {
    target: '[data-tour="save-btn"]',
    title: 'Save Your Work',
    content:
      'Save your slides before recording. Any changes to slide content or notes need to be saved first.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'lesson-editor' },
  },
  {
    target: '[data-tour="sim-record-btn"]',
    title: 'Record Your Sim',
    content:
      'When your slides are ready, click "Sim β" to start recording. A sim captures your voice, slide navigation, whiteboard drawings, and activity demonstrations — all in one take.',
    placement: 'bottom',
    skipBeacon: true,
    spotlightClicks: true,
    data: { segment: 'lesson-editor' },
  },

  // ── Segment 3: During Sim Recording ─────────────────────────────────────
  {
    target: '[data-tour="rec-indicator"]',
    title: 'Recording in Progress',
    content:
      'You\'re recording! The timer shows how long you\'ve been going. Maximum recording time is 45 minutes.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="sim-nav-arrows"]',
    title: 'Navigate Your Slides',
    content:
      'Use these arrows to move through your slides as you teach. You can also use the arrow keys on your keyboard or spacebar to advance.',
    placement: 'top',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="draw-btn"]',
    title: 'Whiteboard Drawing',
    content:
      'Toggle the whiteboard to draw, highlight, or annotate directly on your slides while teaching. Students see your drawings during playback.',
    placement: 'top',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="pause-here-btn"]',
    title: 'Pause for Student Activity',
    content:
      'Drop a pause marker here. During playback, the student\'s sim will stop at this point with a "Continue" button. Perfect for pausing before an activity — explain the task first, then drop the pause so students can try it themselves.',
    placement: 'top',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="explore-btn"]',
    title: 'Insert Exploration',
    content:
      'Insert an interactive exploration widget at this moment. Students get a hands-on activity embedded right in the sim playback.',
    placement: 'top',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="sim-notes-panel"]',
    title: 'Your Teaching Notes',
    content:
      'Your speaker notes appear here as a reference while you record. You can also type quick timestamped notes that get saved with the recording.',
    placement: 'left',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="sim-pause-resume"]',
    title: 'Pause / Resume',
    content:
      'Need a moment? Pause the recording — your audio pauses too. Click again to resume.',
    placement: 'top',
    skipBeacon: true,
    data: { segment: 'sim-recording' },
  },
  {
    target: '[data-tour="sim-stop-btn"]',
    title: 'Finish Recording',
    content:
      'When you\'re done teaching, click Stop. You\'ll get to review your recording before saving it.',
    placement: 'top',
    skipBeacon: true,
    spotlightClicks: true,
    data: { segment: 'sim-recording' },
  },

  // ── Segment 4: Post-recording / Publishing ──────────────────────────────
  {
    target: '[data-tour="sim-tab"]',
    title: 'Review Your Sim',
    content:
      'After saving, your recorded sim appears in this tab. You can play it back and generate homework questions from the lesson content.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'post-recording' },
  },
  {
    target: '[data-tour="publish-badge"]',
    title: 'Publish Your Lesson',
    content:
      'Once everything is ready — slides, sim recording, and curriculum topic — toggle this to publish. Students will then see the lesson in their dashboard.',
    placement: 'bottom',
    skipBeacon: true,
    data: { segment: 'post-recording' },
  },
];

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function TourTooltip({
  continuous,
  index,
  step,
  size,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-[360px] overflow-hidden"
    >
      {/* Emerald accent bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-600" />

      <div className="p-5">
        {/* Step counter */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
            Step {index + 1} of {size}
          </span>
          <button
            {...closeProps}
            className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
            aria-label="Close guide"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title */}
        {step.title && (
          <h3 className="text-base font-bold text-gray-900 mb-1.5">
            {step.title as string}
          </h3>
        )}

        {/* Content */}
        <p className="text-sm text-gray-600 leading-relaxed">
          {step.content}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <button
            {...skipProps}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                {...backProps}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            )}
            {continuous && (
              <button
                {...primaryProps}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                {isLastStep ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface SimOnboardingTourProps {
  /** Which segments are relevant on this page. */
  segments: TourSegment[];
}

export default function SimOnboardingTour({ segments }: SimOnboardingTourProps) {
  const { consumePending, dismissTour, startTour } = useTourState();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter steps to only those whose segment matches this page.
  const steps = useMemo(() => {
    return ALL_STEPS.filter((s) => s.data?.segment && segments.includes(s.data.segment));
  }, [segments]);

  // Clean up polling on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // On mount, check for ?tour=1 query param (for testing) or a pending segment.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceTour = params.get('tour') === '1';

    if (forceTour) {
      // Remove the param from the URL so refresh doesn't re-trigger
      params.delete('tour');
      const clean = params.toString();
      const url = window.location.pathname + (clean ? `?${clean}` : '');
      window.history.replaceState({}, '', url);

      const timeout = setTimeout(() => {
        setStepIndex(0);
        setRun(true);
      }, 600);
      return () => clearTimeout(timeout);
    }

    const pending = consumePending();
    if (!pending) return;

    // Small delay to let the page render its data-tour elements.
    const timeout = setTimeout(() => {
      // Find the first step in the pending segment.
      const idx = steps.findIndex((s) => s.data?.segment === pending);
      if (idx >= 0) {
        setStepIndex(idx);
        setRun(true);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [consumePending, steps]);

  /** Start polling for a missing target element. When found, resume the tour. */
  const waitForTarget = useCallback(
    (targetSelector: string, atIndex: number) => {
      // Clear any existing poll
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);

      setRun(false); // Pause joyride while waiting

      pollRef.current = setInterval(() => {
        if (document.querySelector(targetSelector)) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          pollRef.current = null;
          pollTimeoutRef.current = null;
          // Target appeared — resume tour at this step
          setStepIndex(atIndex);
          setRun(true);
        }
      }, 400);

      // Give up after 30s — skip this step
      pollTimeoutRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        pollTimeoutRef.current = null;

        // Try to find the next step with an existing target
        for (let i = atIndex + 1; i < steps.length; i++) {
          const sel = typeof steps[i].target === 'string' ? steps[i].target : null;
          if (sel && document.querySelector(sel)) {
            setStepIndex(i);
            setRun(true);
            return;
          }
        }
        // No more visible steps — end this segment and hand off
        handleSegmentEnd(atIndex);
      }, 30000);
    },
    [steps] // handleSegmentEnd added below via ref pattern
  );

  /** When a segment ends (last step or no more targets), hand off to the next. */
  const handleSegmentEnd = useCallback(() => {
    setRun(false);

    // Find the last segment we were showing
    const lastStep = steps[steps.length - 1];
    const currentSegment = lastStep?.data?.segment;
    if (!currentSegment) {
      dismissTour();
      return;
    }

    const segIdx = SEGMENT_ORDER.indexOf(currentSegment);
    if (segIdx >= 0 && segIdx < SEGMENT_ORDER.length - 1) {
      const nextSeg = SEGMENT_ORDER[segIdx + 1];
      // If the next segment is on this same page, start it
      if (segments.includes(nextSeg)) {
        const idx = steps.findIndex((s) => s.data?.segment === nextSeg);
        if (idx >= 0) {
          const sel = typeof steps[idx].target === 'string' ? steps[idx].target : null;
          if (sel && document.querySelector(sel)) {
            setStepIndex(idx);
            setRun(true);
          } else if (sel) {
            // Target not in DOM yet — wait for it
            waitForTarget(sel, idx);
          }
          return;
        }
      }
      // Next segment is on a different page — save as pending
      startTour(nextSeg);
    } else {
      // Last segment — tour complete
      dismissTour();
    }
  }, [steps, segments, dismissTour, startTour, waitForTarget]);

  const handleEvent = useCallback(
    (data: EventData, _controls: Controls) => {
      const { status, action, type, index } = data;

      // Tour ended (finished or skipped).
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        if (status === STATUS.SKIPPED) {
          dismissTour();
        } else {
          handleSegmentEnd();
        }
        return;
      }

      // Step navigation.
      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.NEXT) {
          const nextIdx = index + 1;
          if (nextIdx >= steps.length) {
            // Past last step — hand off to next segment
            handleSegmentEnd();
            return;
          }
          setStepIndex(nextIdx);
        } else if (action === ACTIONS.PREV) {
          setStepIndex(Math.max(0, index - 1));
        } else if (action === ACTIONS.CLOSE) {
          // X button = dismiss entirely
          setRun(false);
          dismissTour();
        }
      }

      // Target not found — wait for element instead of skipping.
      if (type === EVENTS.TARGET_NOT_FOUND) {
        const step = steps[index];
        const selector = typeof step?.target === 'string' ? step.target : null;
        if (selector) {
          waitForTarget(selector, index);
        } else {
          // No valid selector — skip forward
          setStepIndex(index + 1);
        }
      }
    },
    [dismissTour, handleSegmentEnd, steps, waitForTarget]
  );

  /** Start the tour programmatically (called from parent via custom event). */
  useEffect(() => {
    function handleStart(e: Event) {
      const detail = (e as CustomEvent<{ segment?: string }>).detail;
      const seg = detail?.segment;
      if (seg) {
        const idx = steps.findIndex((s) => s.data?.segment === seg);
        if (idx >= 0) {
          setStepIndex(idx);
          setRun(true);
        }
      } else {
        setStepIndex(0);
        setRun(true);
      }
    }
    window.addEventListener('start-sim-tour', handleStart);
    return () => window.removeEventListener('start-sim-tour', handleStart);
  }, [steps]);

  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      tooltipComponent={TourTooltip}
      onEvent={handleEvent}
      options={{
        buttons: ['back', 'close', 'primary', 'skip'],
        overlayClickAction: false,
        overlayColor: 'rgba(0, 0, 0, 0.4)',
        arrowColor: '#fff',
        zIndex: 10000,
      }}
    />
  );
}

/** Helper to trigger the tour from anywhere on the page. */
export function triggerSimTour(segment?: string) {
  window.dispatchEvent(
    new CustomEvent('start-sim-tour', { detail: { segment } })
  );
}

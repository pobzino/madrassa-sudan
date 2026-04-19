'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import type { Slide, SlideType } from '@/lib/slides.types';
import SlideCard from './SlideCard';
import SlideThumbnail from './SlideThumbnail';
import SlideEditPanel from './SlideEditPanel';
import SlideToolbar, { type InteractiveSlideRequest } from './SlideToolbar';
import { getTotalRevealSteps } from './revealCounts';
import dynamic from 'next/dynamic';
import { useWhiteboard, type WhiteboardEvent } from '@/hooks/useWhiteboard';
import WhiteboardToolbar from './WhiteboardToolbar';
import { useSimRecorder, SIM_MAX_DURATION_MS, type SimRecording } from '@/hooks/useSimRecorder';
import type { SimPayload } from '@/lib/sim.types';
import type { InteractionAnswer } from '@/lib/interactions/types';
import type { ExplorationWidgetType, ExplorationWidgetConfig } from '@/lib/explorations/types';
import type { SlideGenerationContext, SlideLengthPreset, SlideLanguageMode } from '@/lib/slides-generation';

export interface RegenerateProps {
  slideCount: number;
  slideLengthPreset: SlideLengthPreset;
  languageMode: SlideLanguageMode;
  generationContext: SlideGenerationContext | null;
  isGenerating: boolean;
  disabledReason: string | null;
  onSlideLengthPresetChange: (preset: SlideLengthPreset) => void;
  onSlideCountChange: (count: number) => void;
  onGenerated: (slides: Slide[]) => void;
  onGeneratingChange: (generating: boolean, progress: string) => void;
}

const SimReviewModal = dynamic(() => import('./SimReviewModal'), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
const WhiteboardCanvas = dynamic(() => import('./WhiteboardCanvas'), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
const ExplorationPicker = dynamic(() => import('@/components/explorations/ExplorationPicker'), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ExplorationPicker is now imported from @/components/explorations/ExplorationPicker

/** Live spotlight overlay for the teacher during recording. Tracks the pointer. */
function SpotlightRecordingOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      setPos({ x: xPct, y: yPct });
    };
    el.addEventListener('pointermove', handler);
    return () => el.removeEventListener('pointermove', handler);
  }, [containerRef]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30"
      style={{
        background: pos
          ? `radial-gradient(circle at ${pos.x}% ${pos.y}%, transparent 0, transparent 120px, rgba(0,0,0,0.55) 240px)`
          : 'rgba(0,0,0,0.55)',
      }}
      aria-hidden
    />
  );
}

interface InteractivePlaceholders {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  prompt_ar: string;
  prompt_en: string;
  expected_answer_ar: string | null;
  expected_answer_en: string | null;
  options_ar: string[] | null;
  options_en: string[] | null;
  correct_index: number | null;
  true_false_answer: boolean | null;
  count_target: number | null;
  visual_emoji: string | null;
  items_ar: string[] | null;
  items_en: string[] | null;
  targets_ar: string[] | null;
  targets_en: string[] | null;
  solution_map: number[] | null;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a blank slide of the given type at the given sequence. Used by both
 * the editor's "Add Slide" dropdown and the in-recording "Insert Whiteboard"
 * button so both paths stay in sync with the slide shape.
 */
function createBlankSlide(type: SlideType, sequence: number): Slide {
  return {
    id: crypto.randomUUID(),
    type,
    sequence,
    is_required: false,
    timestamp_seconds: null,
    title_ar: '',
    title_en: '',
    body_ar: '',
    body_en: '',
    speaker_notes_ar: '',
    speaker_notes_en: '',
    visual_hint: '',
    bullets_ar: type === 'key_points' || type === 'summary' ? [''] : null,
    bullets_en: type === 'key_points' || type === 'summary' ? [''] : null,
    reveal_items_ar: type === 'question_answer' ? [''] : null,
    reveal_items_en: type === 'question_answer' ? [''] : null,
    image_url: null,
    image_fit: 'contain',
    image_position_x: 50,
    image_position_y: 50,
    image_zoom: 1,
    layout: null,
    title_size: 'md',
    body_size: 'md',
    lesson_phase:
      type === 'title' ? 'title' : type === 'summary' ? 'summary_goodbye' : 'core_teaching',
    idea_focus_en: '',
    idea_focus_ar: '',
    vocabulary_word_en: null,
    vocabulary_word_ar: null,
    say_it_twice_prompt: null,
    practice_question_count:
      type === 'quiz_preview' || type === 'question_answer' ? 1 : null,
    representation_stage: 'not_applicable',
    activity_id: null,
    interaction_type: null,
    interaction_prompt_ar: null,
    interaction_prompt_en: null,
    interaction_expected_answer_ar: null,
    interaction_expected_answer_en: null,
    interaction_options_ar: null,
    interaction_options_en: null,
    interaction_correct_index: null,
    interaction_true_false_answer: null,
    interaction_count_target: null,
    interaction_visual_emoji: null,
    interaction_items_ar: null,
    interaction_items_en: null,
    interaction_targets_ar: null,
    interaction_targets_en: null,
    interaction_solution_map: null,
    interaction_free_entry: null,
  };
}

const CHOOSE_CORRECT_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'true_false_answer' | 'count_target' | 'visual_emoji' | 'items_ar' | 'items_en' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'ما عاصمة السودان؟', title_en: 'What is the capital of Sudan?',
    body_ar: 'اختر الإجابة الصحيحة من الخيارات التالية', body_en: 'Choose the correct answer from the options below',
    prompt_ar: 'ما هي عاصمة السودان؟', prompt_en: 'What is the capital of Sudan?',
    options_ar: ['الخرطوم', 'القاهرة', 'جوبا', 'أديس أبابا'],
    options_en: ['Khartoum', 'Cairo', 'Juba', 'Addis Ababa'],
    correct_index: 0,
  },
  {
    title_ar: 'كم عدد أيام الأسبوع؟', title_en: 'How many days in a week?',
    body_ar: 'اختر العدد الصحيح', body_en: 'Pick the correct number',
    prompt_ar: 'كم يوماً في الأسبوع؟', prompt_en: 'How many days are in a week?',
    options_ar: ['خمسة', 'ستة', 'سبعة', 'ثمانية'],
    options_en: ['Five', 'Six', 'Seven', 'Eight'],
    correct_index: 2,
  },
  {
    title_ar: 'ما أكبر كوكب؟', title_en: 'What is the biggest planet?',
    body_ar: 'اختر الكوكب الأكبر في مجموعتنا الشمسية', body_en: 'Select the largest planet in our solar system',
    prompt_ar: 'أي كوكب هو الأكبر؟', prompt_en: 'Which planet is the largest?',
    options_ar: ['المريخ', 'الأرض', 'المشتري'],
    options_en: ['Mars', 'Earth', 'Jupiter'],
    correct_index: 2,
  },
];

const FREE_RESPONSE_VARIANTS: Omit<InteractivePlaceholders, 'options_ar' | 'options_en' | 'correct_index' | 'true_false_answer' | 'count_target' | 'visual_emoji' | 'items_ar' | 'items_en' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'سؤال مفتوح',
    title_en: 'Open Question',
    body_ar: 'فكّر ثم اكتب إجابتك بطريقتك الخاصة.',
    body_en: 'Think and write your answer in your own words.',
    prompt_ar: 'لماذا نحتاج إلى الماء كل يوم؟',
    prompt_en: 'Why do we need water every day?',
    expected_answer_ar: 'لأن الماء يساعد أجسامنا على البقاء بصحة جيدة.',
    expected_answer_en: 'Because water helps our bodies stay healthy.',
  },
  {
    title_ar: 'اشرح فكرتك',
    title_en: 'Explain Your Thinking',
    body_ar: 'اكتب كيف عرفت الإجابة.',
    body_en: 'Write how you knew the answer.',
    prompt_ar: 'كيف عرفت أن 7 أكبر من 5؟',
    prompt_en: 'How did you know that 7 is greater than 5?',
    expected_answer_ar: 'لأن 7 يأتي بعد 5 ويمكن تمثيله بعدد أكبر من العناصر.',
    expected_answer_en: 'Because 7 comes after 5 and can be shown with more objects.',
  },
];

const TRUE_FALSE_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'options_ar' | 'options_en' | 'correct_index' | 'count_target' | 'visual_emoji' | 'items_ar' | 'items_en' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'صح أم خطأ؟', title_en: 'True or False?',
    body_ar: 'الشمس تدور حول الأرض', body_en: 'The Sun revolves around the Earth',
    prompt_ar: 'هل الشمس تدور حول الأرض؟', prompt_en: 'Does the Sun revolve around the Earth?',
    true_false_answer: false,
  },
  {
    title_ar: 'صح أم خطأ؟', title_en: 'True or False?',
    body_ar: 'الماء يتكون من الهيدروجين والأكسجين', body_en: 'Water is made of hydrogen and oxygen',
    prompt_ar: 'هل الماء يتكون من الهيدروجين والأكسجين؟', prompt_en: 'Is water made of hydrogen and oxygen?',
    true_false_answer: true,
  },
  {
    title_ar: 'صح أم خطأ؟', title_en: 'True or False?',
    body_ar: 'العنكبوت من الحشرات', body_en: 'A spider is an insect',
    prompt_ar: 'هل العنكبوت حشرة؟', prompt_en: 'Is a spider an insect?',
    true_false_answer: false,
  },
];

const FILL_BLANK_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'true_false_answer' | 'count_target' | 'visual_emoji' | 'items_ar' | 'items_en' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'أكمل الجملة', title_en: 'Complete the sentence',
    body_ar: 'اختر الكلمة المناسبة لملء الفراغ', body_en: 'Pick the right word to fill the gap',
    prompt_ar: 'الأرض تدور حول ___', prompt_en: 'The Earth revolves around the ___',
    options_ar: ['القمر', 'الشمس', 'المريخ'],
    options_en: ['Moon', 'Sun', 'Mars'],
    correct_index: 1,
  },
  {
    title_ar: 'أكمل الجملة', title_en: 'Complete the sentence',
    body_ar: 'أكمل الجملة بالكلمة الصحيحة', body_en: 'Complete the sentence with the correct word',
    prompt_ar: 'النبات يحتاج ___ لينمو', prompt_en: 'Plants need ___ to grow',
    options_ar: ['الظلام', 'الضوء', 'الثلج'],
    options_en: ['Darkness', 'Light', 'Ice'],
    correct_index: 1,
  },
];

const TAP_COUNT_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'options_ar' | 'options_en' | 'correct_index' | 'true_false_answer' | 'items_ar' | 'items_en' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'عدّ التفاح!', title_en: 'Count the apples!',
    body_ar: 'اضغط على كل تفاحة تراها', body_en: 'Tap each apple you see',
    prompt_ar: 'كم تفاحة ترى؟', prompt_en: 'How many apples do you see?',
    count_target: 5, visual_emoji: '🍎',
  },
  {
    title_ar: 'عدّ النجوم!', title_en: 'Count the stars!',
    body_ar: 'اضغط على كل نجمة تراها', body_en: 'Tap each star you see',
    prompt_ar: 'كم نجمة ترى؟', prompt_en: 'How many stars do you see?',
    count_target: 7, visual_emoji: '⭐',
  },
  {
    title_ar: 'عدّ الأشجار!', title_en: 'Count the trees!',
    body_ar: 'اضغط على كل شجرة تراها', body_en: 'Tap each tree you see',
    prompt_ar: 'كم شجرة ترى؟', prompt_en: 'How many trees do you see?',
    count_target: 4, visual_emoji: '🌳',
  },
];

const MATCH_PAIRS_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'options_ar' | 'options_en' | 'correct_index' | 'true_false_answer' | 'count_target' | 'visual_emoji' | 'solution_map'>[] = [
  {
    title_ar: 'طابق الحيوان بصوته', title_en: 'Match the animal to its sound',
    body_ar: 'صل كل حيوان بالصوت الذي يصدره', body_en: 'Connect each animal to the sound it makes',
    prompt_ar: 'صل الحيوان بصوته', prompt_en: 'Match each animal to its sound',
    items_ar: ['قطة', 'كلب', 'بقرة'],
    items_en: ['Cat', 'Dog', 'Cow'],
    targets_ar: ['مياو', 'هاو هاو', 'مووو'],
    targets_en: ['Meow', 'Woof', 'Moo'],
  },
  {
    title_ar: 'طابق البلد بعاصمته', title_en: 'Match the country to its capital',
    body_ar: 'صل كل بلد بعاصمته', body_en: 'Connect each country to its capital city',
    prompt_ar: 'صل البلد بعاصمته', prompt_en: 'Match each country to its capital',
    items_ar: ['السودان', 'مصر', 'الأردن'],
    items_en: ['Sudan', 'Egypt', 'Jordan'],
    targets_ar: ['الخرطوم', 'القاهرة', 'عمّان'],
    targets_en: ['Khartoum', 'Cairo', 'Amman'],
  },
];

const SEQUENCE_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'options_ar' | 'options_en' | 'correct_index' | 'true_false_answer' | 'count_target' | 'visual_emoji' | 'targets_ar' | 'targets_en' | 'solution_map'>[] = [
  {
    title_ar: 'رتب دورة حياة الفراشة', title_en: 'Order the butterfly life cycle',
    body_ar: 'رتب المراحل من الأولى إلى الأخيرة', body_en: 'Arrange the stages from first to last',
    prompt_ar: 'رتب مراحل حياة الفراشة', prompt_en: 'Order the butterfly life cycle stages',
    items_ar: ['بيضة', 'يرقة', 'شرنقة', 'فراشة'],
    items_en: ['Egg', 'Caterpillar', 'Chrysalis', 'Butterfly'],
  },
  {
    title_ar: 'رتب خطوات الوضوء', title_en: 'Order the steps of Wudu',
    body_ar: 'رتب الخطوات بالترتيب الصحيح', body_en: 'Put the steps in the correct order',
    prompt_ar: 'رتب خطوات الوضوء', prompt_en: 'Order the Wudu steps',
    items_ar: ['غسل اليدين', 'المضمضة', 'غسل الوجه', 'مسح الرأس'],
    items_en: ['Wash hands', 'Rinse mouth', 'Wash face', 'Wipe head'],
  },
];

const SORT_GROUPS_VARIANTS: Omit<InteractivePlaceholders, 'expected_answer_ar' | 'expected_answer_en' | 'options_ar' | 'options_en' | 'correct_index' | 'true_false_answer' | 'count_target' | 'visual_emoji'>[] = [
  {
    title_ar: 'صنّف: فواكه أم خضروات؟', title_en: 'Sort: Fruits or Vegetables?',
    body_ar: 'ضع كل عنصر في المجموعة المناسبة', body_en: 'Place each item in the correct group',
    prompt_ar: 'صنف إلى فواكه وخضروات', prompt_en: 'Sort into fruits and vegetables',
    items_ar: ['تفاح', 'جزر', 'موز', 'بروكلي'],
    items_en: ['Apple', 'Carrot', 'Banana', 'Broccoli'],
    targets_ar: ['فواكه', 'خضروات'],
    targets_en: ['Fruits', 'Vegetables'],
    solution_map: [0, 1, 0, 1],
  },
  {
    title_ar: 'صنّف: حار أم بارد؟', title_en: 'Sort: Hot or Cold?',
    body_ar: 'ضع كل عنصر في المجموعة المناسبة', body_en: 'Place each item in the correct group',
    prompt_ar: 'صنف إلى حار وبارد', prompt_en: 'Sort into hot and cold',
    items_ar: ['نار', 'ثلج', 'شمس', 'جليد'],
    items_en: ['Fire', 'Ice', 'Sun', 'Glacier'],
    targets_ar: ['حار', 'بارد'],
    targets_en: ['Hot', 'Cold'],
    solution_map: [0, 1, 0, 1],
  },
];

function getVariantPool(type: string): Partial<InteractivePlaceholders>[] {
  switch (type) {
    case 'free_response': return FREE_RESPONSE_VARIANTS;
    case 'choose_correct': return CHOOSE_CORRECT_VARIANTS;
    case 'true_false': return TRUE_FALSE_VARIANTS;
    case 'fill_missing_word': return FILL_BLANK_VARIANTS;
    case 'tap_to_count': return TAP_COUNT_VARIANTS;
    case 'match_pairs': return MATCH_PAIRS_VARIANTS;
    case 'sequence_order': return SEQUENCE_VARIANTS;
    case 'sort_groups': return SORT_GROUPS_VARIANTS;
    default: return [];
  }
}

function getInteractiveSlidePlaceholders(type: string, existingSlides: Slide[]): InteractivePlaceholders {
  const base: InteractivePlaceholders = {
    title_ar: '', title_en: '', body_ar: '', body_en: '',
    prompt_ar: '', prompt_en: '',
    expected_answer_ar: null, expected_answer_en: null,
    options_ar: null, options_en: null, correct_index: null,
    true_false_answer: null, count_target: null, visual_emoji: null,
    items_ar: null, items_en: null, targets_ar: null, targets_en: null,
    solution_map: null,
  };

  const pool = getVariantPool(type);
  if (pool.length === 0) return base;

  // Collect titles already used by slides of the same interaction type
  const usedTitles = new Set(
    existingSlides
      .filter((s) => s.interaction_type === type)
      .map((s) => s.title_en)
  );

  // Pick an unused variant first; fall back to random if all are used
  const unused = pool.filter((v) => !usedTitles.has(v.title_en ?? ''));
  const v = unused.length > 0 ? pickRandom(unused) : pickRandom(pool);

  return { ...base, ...v };
}

interface SlideEditorProps {
  slides: Slide[];
  onChange: (slides: Slide[]) => void;
  onSave: () => void;
  saving: boolean;
  preferredLanguage?: 'ar' | 'en';
  focusedSlideId?: string | null;
  lessonId?: string;
  lessonTitle?: string;
  /** Fires when a sim is saved or deleted, so the parent can sync its state. */
  onSimChange?: (sim: SimPayload | null) => void;
  /** When false, hides sim recording/review buttons. */
  simEnabled?: boolean;
  /** Regeneration popover props — passed from the slides page. */
  regenerateProps?: RegenerateProps;
}

export default function SlideEditor({
  slides,
  onChange,
  onSave,
  saving,
  preferredLanguage = 'ar',
  focusedSlideId,
  lessonId,
  onSimChange,
  simEnabled,
  regenerateProps,
}: SlideEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [language, setLanguage] = useState<'ar' | 'en'>(preferredLanguage);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [showActivityAnswer, setShowActivityAnswer] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);

  // Sim (event-sourced) recording state — parallel test flow alongside video Record.
  const [simRecording, setSimRecording] = useState(false);
  // The lesson's single saved sim (or null if never recorded). Hydrated on
  // mount and kept in sync with save/delete results from SimReviewModal.
  const [existingSim, setExistingSim] = useState<SimPayload | null>(null);
  const [lessonPublished, setLessonPublished] = useState(false);
  // Which SimReviewModal mode is open (null = closed). Driven by three
  // entry points: stop-of-recording (record-review), Sim toolbar button on
  // a draft lesson (edit), and Sim toolbar button on a published lesson (view).
  const [simReviewMode, setSimReviewMode] = useState<
    | { kind: 'record-review'; recording: SimRecording; deckSnapshot: Slide[] }
    | { kind: 'edit'; payload: SimPayload }
    | { kind: 'view'; payload: SimPayload }
    | null
  >(null);
  // Teacher's in-progress answer on the current activity slide. Drives the
  // DnD preview panel during sim recording and is reset whenever the
  // presented slide changes so the next activity starts fresh.
  const [activitySimAnswer, setActivitySimAnswer] = useState<InteractionAnswer | null>(null);

  const simRecorder = useSimRecorder();
  // Destructure stable references. `recordEvent`, `startRecording`, etc. are
  // `useCallback`s with stable deps inside the hook, so these references are
  // stable across renders — safe to use in other hooks' dep arrays.
  const {
    recordEvent: recordSimEvent,
    state: simState,
    recording: simRecordingData,
    startRecording: simStartRecording,
    stopRecording: simStopRecording,
    pauseRecording: simPauseRecording,
    resumeRecording: simResumeRecording,
    cancelRecording: simCancelRecording,
    recordingDurationMs: simDurationMs,
    countdownValue: simCountdown,
    errorMessage: simRecorderError,
    audioLevel: simAudioLevel,
    recoveredEvents: simRecoveredEvents,
    acceptRecovery: simAcceptRecovery,
    dismissRecovery: simDismissRecovery,
  } = simRecorder;

  // Refs that the whiteboard→sim bridge reads, so the bridge callback can
  // stay stable while picking up the latest slide/sim state.
  const simRecordingRef = useRef(simRecording);
  const slidesRef = useRef(slides);
  const presentIndexRef = useRef(presentIndex);

  useEffect(() => {
    simRecordingRef.current = simRecording;
  }, [simRecording]);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    presentIndexRef.current = presentIndex;
  }, [presentIndex]);

  // Stable bridge: translate whiteboard events into sim events stamped with
  // the current slide_id. `recordSimEvent` is stable, and all other reads
  // go through refs, so this callback never changes identity.
  const handleWhiteboardEvent = useCallback(
    (event: WhiteboardEvent) => {
      if (!simRecordingRef.current) return;
      const slide = slidesRef.current[presentIndexRef.current];
      if (!slide) return;
      const slideId = slide.id;
      switch (event.type) {
        case 'stroke_start':
          recordSimEvent({
            type: 'stroke_start',
            slide_id: slideId,
            id: event.id,
            tool: event.tool,
            color: event.color,
            width: event.width,
            point: event.point,
          });
          break;
        case 'stroke_point':
          recordSimEvent({
            type: 'stroke_point',
            slide_id: slideId,
            id: event.id,
            point: event.point,
          });
          break;
        case 'stroke_end':
          recordSimEvent({
            type: 'stroke_end',
            slide_id: slideId,
            id: event.id,
            start: event.start,
            end: event.end,
          });
          break;
        case 'stroke_text':
          recordSimEvent({
            type: 'stroke_text',
            slide_id: slideId,
            id: event.id,
            color: event.color,
            text: event.text,
            position: event.position,
            font_size: event.fontSize,
          });
          break;
        case 'stroke_sticker':
          recordSimEvent({
            type: 'stroke_sticker',
            slide_id: slideId,
            id: event.id,
            emoji: event.emoji,
            position: event.position,
            font_size: event.fontSize,
          });
          break;
        case 'stroke_erase':
          recordSimEvent({
            type: 'stroke_erase',
            slide_id: slideId,
            id: event.id,
          });
          break;
        case 'clear_strokes':
          recordSimEvent({
            type: 'clear_strokes',
            slide_id: slideId,
          });
          break;
      }
    },
    [recordSimEvent]
  );

  const whiteboard = useWhiteboard({ onEvent: handleWhiteboardEvent });

  // Bridge laser pointer moves from WhiteboardCanvas into sim events.
  // Throttled to ~10 events/sec so we don't bloat the timeline.
  const lastLaserEmitRef = useRef(0);
  const handleLaserMove = useCallback(
    (x: number, y: number) => {
      if (!simRecordingRef.current) return;
      const now = performance.now();
      if (now - lastLaserEmitRef.current < 100) return;
      lastLaserEmitRef.current = now;
      const slide = slidesRef.current[presentIndexRef.current];
      if (!slide) return;
      recordSimEvent({ type: 'laser', slide_id: slide.id, x, y });
    },
    [recordSimEvent]
  );

  useEffect(() => {
    setLanguage(preferredLanguage);
  }, [preferredLanguage]);

  // Prevent accidental tab/window close while sim is recording
  useEffect(() => {
    if (!simRecording) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [simRecording]);

  useEffect(() => {
    if (!focusedSlideId) {
      return;
    }

    const index = slides.findIndex((slide) => slide.id === focusedSlideId);
    if (index >= 0) {
      setSelectedIndex(index);
    }
  }, [focusedSlideId, slides]);

  const slideContainerRef = useRef<HTMLDivElement>(null);


  const selectedSlide = slides[selectedIndex] || null;

  // Get reveal item count for current presentation slide
  const presentSlide = slides[presentIndex];
  const totalRevealItems = getTotalRevealSteps(presentSlide, language);
  const isPresentActivitySlide = presentSlide?.type === 'activity';
  const canGoPreviousWhileRecording = presentIndex > 0;
  const canGoNextWhileRecording = presentIndex < slides.length - 1 || revealedCount < totalRevealItems;

  // Reset reveal count when slide changes + sync whiteboard.
  // Deliberately depending only on `presentIndex` and the stable
  // `whiteboard.setSlideIndex` callback — NOT on `whiteboard` itself, because
  // `useWhiteboard` returns a fresh object literal on every render, which
  // would cause this effect to re-fire on every stroke and clobber the
  // drawing that was just committed.
  const syncWhiteboardSlide = whiteboard.setSlideIndex;
  useEffect(() => {
    const timeout = setTimeout(() => {
      setRevealedCount(0);
      setShowActivityAnswer(false);
      setActivitySimAnswer(null);
    }, 0);

    syncWhiteboardSlide(presentIndex);

    return () => clearTimeout(timeout);
  }, [presentIndex, syncWhiteboardSlide]);

  // No-op for backwards compat with sim recording code that calls this
  const captureAfterNavigation = useCallback(() => {}, []);

  const goToNextPresentStep = useCallback(() => {
    flushSync(() => {
      if (totalRevealItems > 0 && revealedCount < totalRevealItems) {
        setRevealedCount((c) => c + 1);
      } else {
        setPresentIndex((i) => Math.min(i + 1, slides.length - 1));
      }
    });

    captureAfterNavigation();
  }, [captureAfterNavigation, revealedCount, slides.length, totalRevealItems]);

  const goToPreviousPresentStep = useCallback(() => {
    flushSync(() => {
      setPresentIndex((i) => Math.max(i - 1, 0));
      setRevealedCount(0);
    });

    captureAfterNavigation();
  }, [captureAfterNavigation]);

  // ── Sim event emission ────────────────────────────────────────────────────
  // Emit `slide_change` whenever the presented slide changes or the recorder
  // transitions into the 'recording' state. This handles the initial
  // slide_change at the start of recording and every subsequent navigation.
  // `activity_gate` events are intentionally NOT emitted here — the teacher
  // inserts them explicitly via the "Pause here" button so they can finish
  // explaining the task before handing off to the student.
  useEffect(() => {
    if (!simRecording) return;
    if (simState !== 'recording' && simState !== 'paused') return;
    const slide = slides[presentIndex];
    if (!slide) return;
    recordSimEvent({ type: 'slide_change', slide_id: slide.id });
  }, [presentIndex, simRecording, simState, slides, recordSimEvent]);

  // Emit `reveal_bullet` events each time `revealedCount` ticks up on the
  // current slide. Resets the tracker whenever the slide changes.
  const prevRevealRef = useRef<{ slideId: string; count: number }>({ slideId: '', count: 0 });
  useEffect(() => {
    if (!simRecording) return;
    if (simState !== 'recording' && simState !== 'paused') return;
    const slide = slides[presentIndex];
    if (!slide) {
      prevRevealRef.current = { slideId: '', count: 0 };
      return;
    }
    const prev = prevRevealRef.current;
    if (prev.slideId === slide.id && revealedCount > prev.count) {
      for (let i = prev.count; i < revealedCount; i++) {
        recordSimEvent({ type: 'reveal_bullet', slide_id: slide.id, index: i });
      }
    }
    prevRevealRef.current = { slideId: slide.id, count: revealedCount };
  }, [revealedCount, presentIndex, simRecording, simState, slides, recordSimEvent]);

  // Reset the draft answer when the teacher selects a different slide in the
  // edit canvas so switching between activity slides doesn't carry stale
  // drag placements across them.
  useEffect(() => {
    setActivitySimAnswer(null);
  }, [selectedIndex]);

  // Teacher dragged an item on an interactive activity slide. Update the
  // local draft answer and, if a sim is recording, stamp an `activity_answer`
  // event so the student replay reconstructs the same placement. Depending
  // only on the current slide id keeps the callback stable across unrelated
  // edits to other slides.
  const presentSlideId = slides[presentIndex]?.id ?? null;
  const handleActivityAnswerChange = useCallback(
    (answer: InteractionAnswer) => {
      setActivitySimAnswer(answer);
      if (!simRecording) return;
      if (simState !== 'recording' && simState !== 'paused') return;
      if (!presentSlideId) return;
      recordSimEvent({
        type: 'activity_answer',
        slide_id: presentSlideId,
        answer,
      });
    },
    [simRecording, simState, presentSlideId, recordSimEvent]
  );

  // Teacher-controlled pause marker. Hitting "Pause here" during a sim
  // recording stamps an `activity_gate` at the current moment so playback
  // halts there with a Continue overlay. This replaces the old auto-emit on
  // activity-slide navigation — teachers can now explain the task first and
  // drop the gate only when they're ready to hand off.
  const [gateFlash, setGateFlash] = useState(false);
  const gateFlashTimerRef = useRef<number | null>(null);
  const handleInsertSimGate = useCallback(() => {
    if (!simRecording) return;
    if (simState !== 'recording' && simState !== 'paused') return;
    const slide = slides[presentIndex];
    if (!slide) return;
    recordSimEvent({
      type: 'activity_gate',
      slide_id: slide.id,
      task_id: slide.type === 'activity' ? slide.activity_id ?? null : null,
    });
    setGateFlash(true);
    if (gateFlashTimerRef.current) window.clearTimeout(gateFlashTimerRef.current);
    gateFlashTimerRef.current = window.setTimeout(() => setGateFlash(false), 1200);
  }, [simRecording, simState, slides, presentIndex, recordSimEvent]);
  useEffect(() => {
    return () => {
      if (gateFlashTimerRef.current) window.clearTimeout(gateFlashTimerRef.current);
    };
  }, []);

  // ── Exploration slide insertion during sim recording ─────────────────────
  const [explorationPickerOpen, setExplorationPickerOpen] = useState(false);
  const [explorationFlash, setExplorationFlash] = useState(false);
  const explorationFlashTimerRef = useRef<number | null>(null);

  const handleInsertExploration = useCallback(
    (widgetType: ExplorationWidgetType, config: ExplorationWidgetConfig) => {
      if (!simRecording) return;
      if (simState !== 'recording' && simState !== 'paused') return;

      // Insert an actual exploration slide after the current slide
      // (same pattern as insertWhiteboardSlideDuringRecording)
      const insertAt = presentIndex + 1;
      const newSlide: Slide = {
        ...createBlankSlide('exploration', insertAt),
        exploration_widget_type: widgetType,
        exploration_config: config,
      };
      const next = [
        ...slides.slice(0, insertAt),
        newSlide,
        ...slides.slice(insertAt),
      ].map((s, i) => ({ ...s, sequence: i }));

      flushSync(() => {
        onChange(next);
        setPresentIndex(insertAt);
        setRevealedCount(0);
        setShowActivityAnswer(false);
      });

      captureAfterNavigation();

      setExplorationPickerOpen(false);
      setExplorationFlash(true);
      if (explorationFlashTimerRef.current) window.clearTimeout(explorationFlashTimerRef.current);
      explorationFlashTimerRef.current = window.setTimeout(() => setExplorationFlash(false), 1200);
    },
    [simRecording, simState, slides, presentIndex, onChange, captureAfterNavigation]
  );

  useEffect(() => {
    return () => {
      if (explorationFlashTimerRef.current) window.clearTimeout(explorationFlashTimerRef.current);
    };
  }, []);

  // ── Teacher notes panel during sim recording ────────────────────────────
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [noteFlash, setNoteFlash] = useState(false);
  const noteFlashTimerRef = useRef<number | null>(null);

  const handleAddNote = useCallback(() => {
    if (!noteText.trim() || !simRecording) return;
    if (simState !== 'recording' && simState !== 'paused') return;
    const slide = slides[presentIndex];
    if (!slide) return;
    recordSimEvent({ type: 'teacher_note', slide_id: slide.id, text: noteText.trim() });
    setNoteText('');
    setNoteFlash(true);
    if (noteFlashTimerRef.current) window.clearTimeout(noteFlashTimerRef.current);
    noteFlashTimerRef.current = window.setTimeout(() => setNoteFlash(false), 1200);
  }, [noteText, simRecording, simState, slides, presentIndex, recordSimEvent]);

  useEffect(() => {
    return () => {
      if (noteFlashTimerRef.current) window.clearTimeout(noteFlashTimerRef.current);
    };
  }, []);

  // ── Spotlight during sim recording ────────────────────────────────────
  const [spotlightActive, setSpotlightActive] = useState(false);
  const spotlightThrottleRef = useRef(0);
  const slideAreaRef = useRef<HTMLDivElement>(null);

  // Turn off spotlight when recording stops
  useEffect(() => {
    if (!simRecording) setSpotlightActive(false);
  }, [simRecording]);

  const handleSpotlightPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!spotlightActive || !simRecordingRef.current) return;
      const now = performance.now();
      if (now - spotlightThrottleRef.current < 100) return;
      spotlightThrottleRef.current = now;
      const el = slideAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1280;
      const y = ((e.clientY - rect.top) / rect.height) * 720;
      const slide = slidesRef.current[presentIndexRef.current];
      if (!slide) return;
      recordSimEvent({ type: 'spotlight_move', slide_id: slide.id, x, y });
    },
    [spotlightActive, recordSimEvent]
  );

  const handleToggleSpotlight = useCallback(() => {
    setSpotlightActive((prev) => {
      const slide = slidesRef.current[presentIndexRef.current];
      if (!slide) return prev;
      if (!prev) {
        // Turn on — emit spotlight_on at center
        recordSimEvent({ type: 'spotlight_on', slide_id: slide.id, x: 640, y: 360 });
      } else {
        // Turn off
        recordSimEvent({ type: 'spotlight_off', slide_id: slide.id });
      }
      return !prev;
    });
  }, [recordSimEvent]);

  // Emit `reveal_answer` when the teacher flips the activity answer on.
  const prevAnswerRevealedRef = useRef(false);
  useEffect(() => {
    if (!simRecording) {
      prevAnswerRevealedRef.current = false;
      return;
    }
    if (simState !== 'recording' && simState !== 'paused') return;
    const slide = slides[presentIndex];
    if (!slide) return;
    if (showActivityAnswer && !prevAnswerRevealedRef.current) {
      recordSimEvent({ type: 'reveal_answer', slide_id: slide.id });
    }
    prevAnswerRevealedRef.current = showActivityAnswer;
  }, [showActivityAnswer, presentIndex, simRecording, simState, slides, recordSimEvent]);

  // Fetch the lesson's existing sim (if any) + the lesson's publish state on
  // mount so the Sim toolbar button and SimReviewModal can pick the right
  // mode (edit vs view) without a second round trip.
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          sim: SimPayload | null;
          lesson_published?: boolean;
        };
        if (cancelled) return;
        setExistingSim(body.sim);
        setLessonPublished(body.lesson_published === true);
      } catch {
        // Non-fatal: the Sim button just won't appear.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  // When the sim recorder finishes, open the review modal so the teacher can
  // scrub, trim, cut, retake, or discard before the recording is uploaded.
  // Nothing is POSTed here — SimReviewModal owns the create flow.
  const simReviewOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (simState !== 'stopped' || !simRecordingData) {
      simReviewOpenedRef.current = null;
      return;
    }
    // Guard against re-firing on unrelated renders after the modal opens.
    const key = `${simRecordingData.durationMs}:${simRecordingData.events.length}`;
    if (simReviewOpenedRef.current === key) return;
    simReviewOpenedRef.current = key;

    setSimRecording(false);
    setPresenting(false);
    setWhiteboardActive(false);
    setSimReviewMode({
      kind: 'record-review',
      recording: simRecordingData,
      deckSnapshot: slidesRef.current,
    });
  }, [simState, simRecordingData]);

  // Keyboard navigation for present mode
  useEffect(() => {
    if (!presenting) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goToNextPresentStep();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPreviousPresentStep();
      } else if (e.key === 'Escape') {
        if (simRecording) {
          if (simState === 'recording' || simState === 'paused') {
            simStopRecording();
          } else {
            setSimRecording(false);
            setPresenting(false);
            setWhiteboardActive(false);
            simCancelRecording();
          }
        } else {
          setPresenting(false);
        }
      } else if ((e.key === 'a' || e.key === 'A') && presentSlide?.type === 'activity') {
        e.preventDefault();
        setShowActivityAnswer((current) => !current);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    goToNextPresentStep,
    goToPreviousPresentStep,
    presentSlide?.type,
    presenting,
    simRecording,
    simState,
    simStopRecording,
    simCancelRecording,
  ]);

  const updateSlide = useCallback(
    (updates: Partial<Slide>) => {
      const next = slides.map((s, i) => (i === selectedIndex ? { ...s, ...updates } : s));
      onChange(next);
    },
    [slides, selectedIndex, onChange]
  );

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1 || selectedSlide?.is_required) return;
    const next = slides.filter((_, i) => i !== selectedIndex).map((s, i) => ({ ...s, sequence: i }));
    onChange(next);
    setSelectedIndex(Math.min(selectedIndex, next.length - 1));
  }, [slides, selectedIndex, onChange, selectedSlide]);

  const addSlide = useCallback(
    (type: SlideType) => {
      const newSlide = createBlankSlide(type, slides.length);
      onChange([...slides, newSlide]);
      setSelectedIndex(slides.length);
    },
    [slides, onChange]
  );

  const addExplorationSlide = useCallback(
    (widgetType: ExplorationWidgetType, config: ExplorationWidgetConfig) => {
      const newSlide: Slide = {
        ...createBlankSlide('exploration', slides.length),
        title_ar: '',
        title_en: '',
        exploration_widget_type: widgetType,
        exploration_config: config,
      };
      onChange([...slides, newSlide]);
      setSelectedIndex(slides.length);
    },
    [slides, onChange]
  );

  // Insert a blank whiteboard slide immediately after the current slide and
  // jump to it — used from the recording overlay so the teacher can pop a
  // fresh drawing surface mid-lesson without leaving record mode.
  const insertWhiteboardSlideDuringRecording = useCallback(() => {
    const insertAt = presentIndex + 1;
    const newSlide = createBlankSlide('whiteboard', insertAt);
    const next = [
      ...slides.slice(0, insertAt),
      newSlide,
      ...slides.slice(insertAt),
    ].map((s, i) => ({ ...s, sequence: i }));

    flushSync(() => {
      onChange(next);
      setPresentIndex(insertAt);
      setRevealedCount(0);
      setShowActivityAnswer(false);
      setWhiteboardActive(true);
    });

    captureAfterNavigation();
  }, [presentIndex, slides, onChange, captureAfterNavigation]);

  const addInteractiveSlide = useCallback(
    (request: InteractiveSlideRequest) => {
      const { interactionType, slideType } = request;

      // Placeholder content per interaction type — picks an unused variant
      const placeholders = getInteractiveSlidePlaceholders(interactionType, slides);

      const newSlide: Slide = {
        id: crypto.randomUUID(),
        type: slideType,
        sequence: slides.length,
        is_required: false,
        timestamp_seconds: null,
        title_ar: placeholders.title_ar,
        title_en: placeholders.title_en,
        body_ar: placeholders.body_ar,
        body_en: placeholders.body_en,
        speaker_notes_ar: '',
        speaker_notes_en: '',
        visual_hint: '',
        bullets_ar: null,
        bullets_en: null,
        reveal_items_ar: null,
        reveal_items_en: null,
        image_url: null,
        layout: null,
        title_size: 'md',
        body_size: 'md',
        lesson_phase: 'practice',
        idea_focus_en: '',
        idea_focus_ar: '',
        vocabulary_word_en: null,
        vocabulary_word_ar: null,
        say_it_twice_prompt: null,
        practice_question_count: 1,
        representation_stage: 'not_applicable',
        activity_id: crypto.randomUUID(),
        interaction_type: interactionType,
        interaction_prompt_ar: placeholders.prompt_ar,
        interaction_prompt_en: placeholders.prompt_en,
        interaction_expected_answer_ar: placeholders.expected_answer_ar,
        interaction_expected_answer_en: placeholders.expected_answer_en,
        interaction_options_ar: placeholders.options_ar,
        interaction_options_en: placeholders.options_en,
        interaction_correct_index: placeholders.correct_index,
        interaction_true_false_answer: placeholders.true_false_answer,
        interaction_count_target: placeholders.count_target,
        interaction_visual_emoji: placeholders.visual_emoji,
        interaction_items_ar: placeholders.items_ar,
        interaction_items_en: placeholders.items_en,
        interaction_targets_ar: placeholders.targets_ar,
        interaction_targets_en: placeholders.targets_en,
        interaction_solution_map: placeholders.solution_map,
        interaction_free_entry: null,
      };
      onChange([...slides, newSlide]);
      setSelectedIndex(slides.length);
    },
    [slides, onChange]
  );

  // Drag and drop reorder
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...slides];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next.map((s, i) => ({ ...s, sequence: i })));
    setDragIndex(index);
    if (selectedIndex === dragIndex) setSelectedIndex(index);
  }, [dragIndex, slides, selectedIndex, onChange]);

  const handleDrop = useCallback(() => {
    setDragIndex(null);
  }, []);

  function startPresent() {
    setPresentIndex(selectedIndex);
    setPresenting(true);
  }

  const startSimRecord = useCallback(async () => {
    if (!lessonId) return;
    if (lessonPublished) {
      toast.error('Unpublish the lesson before recording a new sim.');
      return;
    }
    if (existingSim) {
      const ok = window.confirm(
        'This lesson already has a sim recording. Starting a new recording will replace it when you save. Continue?'
      );
      if (!ok) return;
    }
    setPresentIndex(selectedIndex);
    setRevealedCount(0);
    setShowActivityAnswer(false);
    setPresenting(true);
    setSimRecording(true);
    // Small delay so the fullscreen present-mode DOM renders first.
    await new Promise((r) => setTimeout(r, 100));
    await simStartRecording();
  }, [lessonId, lessonPublished, existingSim, selectedIndex, simStartRecording]);

  // ── SimReviewModal handlers ─────────────────────────────────────────────
  // Recording was saved successfully from the review modal — sync the local
  // state with the returned payload and fully reset the recorder so the
  // effect above doesn't reopen the modal on the stale `simRecordingData`.
  const handleSimSaved = useCallback(
    (payload: SimPayload) => {
      setExistingSim(payload);
      setSimReviewMode(null);
      simReviewOpenedRef.current = null;
      simCancelRecording();
      onSimChange?.(payload);
    },
    [simCancelRecording, onSimChange]
  );

  // Teacher chose Discard — drop the in-memory recording and reset.
  const handleSimDiscard = useCallback(() => {
    setSimReviewMode(null);
    simReviewOpenedRef.current = null;
    simCancelRecording();
  }, [simCancelRecording]);

  // Teacher chose Retake — close the modal, reset the recorder, immediately
  // jump back into the record+present flow (mirrors video `handleRetake`).
  const handleSimRetake = useCallback(() => {
    setSimReviewMode(null);
    simReviewOpenedRef.current = null;
    simCancelRecording();
    void startSimRecord();
  }, [simCancelRecording, startSimRecord]);

  // Edit-mode save — replace the cached sim with the PATCH result.
  const handleSimEditSaved = useCallback((payload: SimPayload) => {
    setExistingSim(payload);
    setSimReviewMode(null);
    onSimChange?.(payload);
  }, [onSimChange]);

  // Edit-mode delete — clear the cache and close.
  const handleSimDeleted = useCallback(() => {
    setExistingSim(null);
    setSimReviewMode(null);
    onSimChange?.(null);
  }, [onSimChange]);

  // Sim toolbar button — pick edit or view mode based on publish state.
  const handleOpenSim = useCallback(() => {
    if (!existingSim) return;
    setSimReviewMode({
      kind: lessonPublished ? 'view' : 'edit',
      payload: existingSim,
    });
  }, [existingSim, lessonPublished]);

  const handleToggleAnswerReveal = useCallback(() => {
    setShowActivityAnswer((current) => !current);
  }, []);

  // Fullscreen present mode
  if (presenting) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="flex h-full w-full items-center justify-center gap-6 px-4 py-6 lg:px-6">
          <div
            ref={(el) => { (slideContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; slideAreaRef.current = el; }}
            className={`relative mx-auto w-full ${simRecording ? 'max-w-5xl lg:max-w-[min(72vw,1100px)]' : 'max-w-6xl'}`}
            onPointerMove={spotlightActive ? handleSpotlightPointerMove : undefined}
          >
            <SlideCard
              // Keying on slide id + language remounts the card only on slide
              // navigation or language switch, which is when the entrance
              // animation should replay. Reveal state flows through props so
              // progressive reveal updates without forcing a remount.
              key={`${slides[presentIndex]?.id ?? presentIndex}:${language}`}
              slide={slides[presentIndex]}
              language={language}
              className="!rounded-none !shadow-2xl"
              applyEntranceAnimation
              revealedCount={totalRevealItems > 0 ? revealedCount : undefined}
              onReveal={() => setRevealedCount((c) => c + 1)}
              showActivityAnswer={isPresentActivitySlide ? showActivityAnswer : false}
              // Turn on the real DnD widget inside the slide canvas so the
              // teacher can drag items while presenting. When a sim is
              // recording, every draft answer is captured via
              // `handleActivityAnswerChange` as an `activity_answer` event.
              activityInteractive
              activityAnswer={activitySimAnswer}
              onActivityAnswerChange={handleActivityAnswerChange}
            />
            {simRecording && (
              <WhiteboardCanvas
                whiteboard={whiteboard}
                active={whiteboardActive}
                onLaserMove={handleLaserMove}
              />
            )}
            {/* Spotlight visual overlay — dims slide with a light circle at pointer */}
            {simRecording && spotlightActive && (
              <SpotlightRecordingOverlay containerRef={slideAreaRef} />
            )}
          </div>

        </div>

        {/* Whiteboard toolbar — visible when drawing is active */}
        {simRecording && whiteboardActive && (simState === 'recording' || simState === 'paused') && (
          <WhiteboardToolbar whiteboard={whiteboard} />
        )}

        {/* Sim recording HUD */}
        {simRecording && (
          <>
            {/* Countdown */}
            {simState === 'countdown' && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="text-white text-[12rem] font-bold tabular-nums">
                  {simCountdown}
                </div>
              </div>
            )}

            {/* REC indicator + controls */}
            {(simState === 'recording' || simState === 'paused' || simState === 'preparing') && (
              <div data-tour="rec-indicator" className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-black/80 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-2xl">
                <span className="flex items-center gap-2 text-white text-sm font-semibold">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      simState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-white/60'
                    }`}
                  />
                  {simState === 'paused' ? 'PAUSED' : 'REC'}
                </span>
                <span className={`text-sm tabular-nums min-w-[48px] text-center ${simDurationMs >= SIM_MAX_DURATION_MS - 120_000 ? 'text-red-400 font-bold' : 'text-white/80'}`}>
                  {formatDuration(simDurationMs)}
                </span>
                {/* Mic level meter */}
                <div className="flex items-end gap-px h-4" title={`Mic level: ${simAudioLevel}%`}>
                  {[20, 40, 60, 80, 100].map((threshold) => (
                    <div
                      key={threshold}
                      className="w-[3px] rounded-sm transition-all duration-75"
                      style={{
                        height: `${(threshold / 100) * 16}px`,
                        backgroundColor: simAudioLevel >= threshold
                          ? threshold <= 60 ? '#4ade80' : threshold <= 80 ? '#facc15' : '#f87171'
                          : 'rgba(255,255,255,0.15)',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Teacher notes panel */}
            {(simState === 'recording' || simState === 'paused') && (
              notesExpanded ? (
                <div data-tour="sim-notes-panel" className="fixed top-4 right-4 z-[60] w-72 bg-black/80 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                    <span className="text-white/80 text-xs font-semibold flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      Notes
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotesExpanded(false)}
                      className="text-white/50 hover:text-white/80 transition-colors"
                      aria-label="Collapse notes"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                      </svg>
                    </button>
                  </div>
                  {/* Speaker notes */}
                  {(() => {
                    const slide = slides[presentIndex];
                    const notes = slide
                      ? (language === 'ar' ? slide.speaker_notes_ar : slide.speaker_notes_en)
                      : '';
                    return notes ? (
                      <div className="px-3 py-2 max-h-32 overflow-y-auto text-white/70 text-xs leading-relaxed border-b border-white/10">
                        {notes}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-white/30 text-xs italic border-b border-white/10">
                        No speaker notes for this slide
                      </div>
                    );
                  })()}
                  {/* Quick note input */}
                  <div className="flex items-center gap-1.5 px-2 py-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                      placeholder="Add a note..."
                      className="flex-1 bg-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={!noteText.trim()}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        noteFlash
                          ? 'bg-emerald-400 text-black'
                          : 'bg-white/15 text-white hover:bg-white/25 disabled:text-white/20 disabled:hover:bg-white/15'
                      }`}
                    >
                      {noteFlash ? 'Added!' : 'Add'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesExpanded(true)}
                  className="fixed top-4 right-4 z-[60] w-10 h-10 bg-black/80 backdrop-blur-sm rounded-full shadow-2xl grid place-items-center text-white/60 hover:text-white/90 transition-colors"
                  aria-label="Show notes"
                >
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </button>
              )
            )}

            {/* Bottom control bar */}
            {(simState === 'recording' || simState === 'paused') && (
              <div data-tour="sim-nav-arrows" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-black/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-2xl">
                <button
                  onClick={goToPreviousPresentStep}
                  disabled={!canGoPreviousWhileRecording}
                  className="text-white/80 hover:text-white disabled:text-white/30 p-2 transition-colors"
                  aria-label="Previous slide"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <span className="text-white/80 text-xs font-medium min-w-[48px] text-center tabular-nums">
                  {presentIndex + 1} / {slides.length}
                </span>
                <button
                  onClick={goToNextPresentStep}
                  disabled={!canGoNextWhileRecording}
                  className="text-white/80 hover:text-white disabled:text-white/30 p-2 transition-colors"
                  aria-label="Next slide"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                <div className="w-px h-5 bg-white/20" />

                <button
                  onClick={insertWhiteboardSlideDuringRecording}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
                  title="Insert a blank whiteboard slide"
                >
                  Whiteboard
                </button>

                <button
                  data-tour="draw-btn"
                  onClick={() => setWhiteboardActive((v) => !v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    whiteboardActive
                      ? 'bg-white text-black'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {whiteboardActive ? 'Draw: On' : 'Draw'}
                </button>

                <button
                  onClick={handleToggleSpotlight}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    spotlightActive
                      ? 'bg-amber-400 text-black'
                      : 'text-white/80 hover:text-white'
                  }`}
                  title="Spotlight — dim the slide and highlight where you point"
                >
                  {spotlightActive ? 'Spot: On' : 'Spot'}
                </button>

                {isPresentActivitySlide && (
                  <button
                    onClick={handleToggleAnswerReveal}
                    className={`text-xs font-semibold transition-colors ${
                      showActivityAnswer
                        ? 'text-amber-300 hover:text-amber-200'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {showActivityAnswer ? 'Hide Answer' : 'Reveal Answer'}
                  </button>
                )}

                <button
                  data-tour="pause-here-btn"
                  onClick={handleInsertSimGate}
                  title="Drop a checkpoint at this moment — playback will stop here with a Continue button"
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    gateFlash
                      ? 'bg-emerald-400 text-black'
                      : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {gateFlash ? 'Checkpoint set' : 'Checkpoint'}
                </button>

                {/* Insert Exploration */}
                <div className="relative">
                  <button
                    data-tour="explore-btn"
                    onClick={() => setExplorationPickerOpen((v) => !v)}
                    title="Insert an exploration widget — students interact with a hands-on activity"
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      explorationFlash
                        ? 'bg-blue-400 text-black'
                        : explorationPickerOpen
                          ? 'bg-blue-500/30 text-white'
                          : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    <span className="text-sm">🔍</span>
                    {explorationFlash ? 'Added' : 'Explore'}
                  </button>

                  {explorationPickerOpen && (
                    <div className="absolute bottom-full mb-2 right-0 z-50 w-72">
                      <ExplorationPicker
                        variant="dark"
                        onInsert={handleInsertExploration}
                        onClose={() => setExplorationPickerOpen(false)}
                        currentSlideImageUrl={slides[presentIndex]?.image_url ?? null}
                      />
                    </div>
                  )}
                </div>

                <div className="w-px h-5 bg-white/20" />

                {simState === 'recording' ? (
                  <button
                    data-tour="sim-pause-resume"
                    onClick={simPauseRecording}
                    className="text-white/80 hover:text-white p-2 transition-colors"
                    aria-label="Pause"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={simResumeRecording}
                    className="text-white/80 hover:text-white p-2 transition-colors"
                    aria-label="Resume"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}

                <button
                  data-tour="sim-stop-btn"
                  onClick={simStopRecording}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                >
                  <span className="inline-block w-2 h-2 bg-white rounded-sm" />
                  Stop
                </button>
              </div>
            )}

          </>
        )}

        {/* Sim recorder errors (mic permission, etc.) — upload errors now
            surface inside SimReviewModal. */}
        {simRecorderError && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-red-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
            {simRecorderError}
          </div>
        )}

        {/* Crash recovery banner */}
        {simRecoveredEvents && simState === 'idle' && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-amber-600 text-white text-sm px-4 py-2 rounded-xl shadow-lg flex items-center gap-3">
            <span>Recovered {simRecoveredEvents.length} events from a previous session (no audio)</span>
            <button onClick={simAcceptRecovery} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-xs font-semibold">
              Restore
            </button>
            <button onClick={simDismissRecovery} className="text-white/70 hover:text-white text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Controls overlay — hide during active recording */}
        {!simRecording && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-sm rounded-full px-6 py-3">
            <button
              onClick={goToPreviousPresentStep}
              disabled={presentIndex === 0}
              className="text-white/80 hover:text-white disabled:text-white/30 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-white/80 text-sm font-medium min-w-[60px] text-center">
              {presentIndex + 1} / {slides.length}
            </span>
            <button
              onClick={goToNextPresentStep}
              disabled={presentIndex === slides.length - 1 && revealedCount >= totalRevealItems}
              className="text-white/80 hover:text-white disabled:text-white/30 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {isPresentActivitySlide && (
              <>
                <div className="w-px h-5 bg-white/30" />
                <button
                  onClick={handleToggleAnswerReveal}
                  className={`text-sm font-medium transition-colors ${
                    showActivityAnswer
                      ? 'text-amber-300 hover:text-amber-200'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {showActivityAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </button>
              </>
            )}
            <div className="w-px h-5 bg-white/30" />
            <button
              onClick={() => setPresenting(false)}
              className="text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {/* Language toggle in present mode */}
        {!simRecording && (
          <div className="absolute top-4 right-4">
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              className="px-3 py-1.5 bg-white/10 backdrop-blur-sm text-white rounded-lg text-xs font-medium hover:bg-white/20 transition-colors"
            >
              {language === 'ar' ? 'EN' : 'عربي'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-120px)] bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
        {/* Toolbar */}
        <SlideToolbar
          language={language}
          onLanguageChange={setLanguage}
          onAddSlide={addSlide}
          onAddInteractiveSlide={addInteractiveSlide}
          onAddExplorationSlide={addExplorationSlide}
          onSave={onSave}
          onPresent={startPresent}
          onRecordSim={lessonId && simEnabled ? startSimRecord : undefined}
          onOpenSim={lessonId && simEnabled ? handleOpenSim : undefined}
          hasSim={existingSim !== null}
          saving={saving}
          slideCount={slides.length}
          regenerateProps={regenerateProps}
          lessonId={lessonId}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Thumbnail sidebar */}
          <div className="w-48 bg-gray-50 border-r border-gray-200 overflow-y-auto p-3 space-y-2 flex-shrink-0">
            {slides.map((slide, index) => (
              <SlideThumbnail
                key={slide.id}
                slide={slide}
                language={language}
                index={index}
                draggable
                isSelected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(index); }}
                onDrop={handleDrop}
              />
            ))}
          </div>

          {/* Main preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-gray-100 overflow-auto">
            {selectedSlide ? (
              <div className="w-full max-w-4xl">
                <SlideCard
                  slide={selectedSlide}
                  language={language}
                  activityInteractive
                  activityAnswer={activitySimAnswer}
                  onActivityAnswerChange={handleActivityAnswerChange}
                />
                {/* Speaker notes below */}
                {(selectedSlide.speaker_notes_ar || selectedSlide.speaker_notes_en) && (
                  <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Speaker Notes</p>
                    <p className="text-sm text-gray-700" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      {language === 'ar' ? selectedSlide.speaker_notes_ar : selectedSlide.speaker_notes_en}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No slides yet.</p>
            )}
          </div>

          {/* Edit panel */}
          {selectedSlide && (
            <div className="w-72 border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
              <SlideEditPanel
                slide={selectedSlide}
                onUpdate={updateSlide}
                onDelete={deleteSlide}
                canDelete={!selectedSlide.is_required}
                canEditType={!selectedSlide.is_required}
                lessonId={lessonId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Sim review / edit / view modal — single entry point for all sim UX. */}
      {simReviewMode && lessonId && simReviewMode.kind === 'record-review' && (
        <SimReviewModal
          mode="record-review"
          lessonId={lessonId}
          language={language}
          recording={simReviewMode.recording}
          deckSnapshot={simReviewMode.deckSnapshot}
          onDiscard={handleSimDiscard}
          onRetake={handleSimRetake}
          onSaved={handleSimSaved}
        />
      )}
      {simReviewMode && lessonId && simReviewMode.kind === 'edit' && (
        <SimReviewModal
          mode="edit"
          lessonId={lessonId}
          language={language}
          payload={simReviewMode.payload}
          onClose={() => setSimReviewMode(null)}
          onSaved={handleSimEditSaved}
          onDeleted={handleSimDeleted}
        />
      )}
      {simReviewMode && lessonId && simReviewMode.kind === 'view' && (
        <SimReviewModal
          mode="view"
          lessonId={lessonId}
          language={language}
          payload={simReviewMode.payload}
          onClose={() => setSimReviewMode(null)}
        />
      )}
    </>
  );
}

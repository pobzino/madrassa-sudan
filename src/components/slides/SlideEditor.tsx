'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { Slide, SlideType } from '@/lib/slides.types';
import type { LessonVideoProcessingStatus } from '@/lib/lessons/video-processing';
import SlideCard from './SlideCard';
import SlideThumbnail from './SlideThumbnail';
import SlideEditPanel from './SlideEditPanel';
import SlideToolbar, { type InteractiveSlideRequest } from './SlideToolbar';
import RecordingOverlay from './RecordingOverlay';
import RecordingReviewModal from './RecordingReviewModal';
import { useBackgroundVideoUpload } from '@/contexts/BackgroundVideoUploadContext';
import { useSlideRecorder } from '@/hooks/useSlideRecorder';

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
  onVideoReady?: (urls: {
    video_url_1080p: string;
    video_url_360p: string;
    video_url_480p: string;
    video_url_720p: string;
    duration_seconds?: number;
    video_processing_status?: LessonVideoProcessingStatus;
    video_processing_error?: string | null;
    video_processed_at?: string | null;
  }) => void;
}

export default function SlideEditor({
  slides,
  onChange,
  onSave,
  saving,
  preferredLanguage = 'ar',
  focusedSlideId,
  lessonId,
  lessonTitle,
  onVideoReady,
}: SlideEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [language, setLanguage] = useState<'ar' | 'en'>(preferredLanguage);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [showActivityAnswer, setShowActivityAnswer] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    setLanguage(preferredLanguage);
  }, [preferredLanguage]);

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

  const {
    recorderState,
    recordingDuration,
    recordedBlob,
    errorMessage: recorderError,
    countdownValue,
    startRecording: recorderStart,
    stopRecording: recorderStop,
    pauseRecording,
    resumeRecording,
    canvasRef,
    snapshotSlide,
  } = useSlideRecorder({ slideContainerRef });
  const backgroundVideoUpload = useBackgroundVideoUpload();

  const selectedSlide = slides[selectedIndex] || null;

  // Get reveal item count for current presentation slide
  const presentSlide = slides[presentIndex];
  const presentRevealItems = presentSlide?.type === 'question_answer'
    ? (language === 'ar' ? presentSlide.reveal_items_ar : presentSlide.reveal_items_en) || []
    : [];
  const totalRevealItems = presentRevealItems.length;
  const presentSpeakerNotesPrimary = language === 'ar'
    ? presentSlide?.speaker_notes_ar?.trim()
    : presentSlide?.speaker_notes_en?.trim();
  const presentSpeakerNotesFallback = language === 'ar'
    ? presentSlide?.speaker_notes_en?.trim()
    : presentSlide?.speaker_notes_ar?.trim();
  const presentSpeakerNotes = presentSpeakerNotesPrimary || presentSpeakerNotesFallback || '';
  const isPresentActivitySlide = presentSlide?.type === 'activity';
  const canGoPreviousWhileRecording = presentIndex > 0;
  const canGoNextWhileRecording = presentIndex < slides.length - 1 || revealedCount < totalRevealItems;

  // Reset reveal count when slide changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      setRevealedCount(0);
      setShowActivityAnswer(false);
    }, 0);

    return () => clearTimeout(timeout);
  }, [presentIndex]);

  // Snapshot slide when presentIndex or revealedCount changes during recording
  // Small delay lets React paint the new slide before html-to-image captures it
  useEffect(() => {
    if (recording && (recorderState === 'recording' || recorderState === 'paused')) {
      const t = setTimeout(() => snapshotSlide(), 120);
      return () => clearTimeout(t);
    }
  }, [presentIndex, revealedCount, showActivityAnswer, recording, recorderState, snapshotSlide]);

  const captureAfterNavigation = useCallback(() => {
    if (!recording || (recorderState !== 'recording' && recorderState !== 'paused')) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        snapshotSlide();
      });
    });
  }, [recording, recorderState, snapshotSlide]);

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

  // When recording stops, show review modal
  useEffect(() => {
    if (recorderState === 'stopped' && recordedBlob) {
      const timeout = setTimeout(() => {
        setRecording(false);
        setPresenting(false);
        setShowReviewModal(true);
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [recorderState, recordedBlob]);

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
        if (recording) {
          // During recording, Escape stops recording instead of exiting
          recorderStop();
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
  }, [goToNextPresentStep, goToPreviousPresentStep, presentSlide?.type, presenting, recording, recorderStop]);

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
      const newSlide: Slide = {
        id: crypto.randomUUID(),
        type,
        sequence: slides.length,
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
        layout: null,
        title_size: 'md',
        body_size: 'md',
        lesson_phase: type === 'title' ? 'title' : type === 'summary' ? 'summary_goodbye' : 'core_teaching',
        idea_focus_en: '',
        idea_focus_ar: '',
        vocabulary_word_en: null,
        vocabulary_word_ar: null,
        say_it_twice_prompt: null,
        practice_question_count: type === 'quiz_preview' || type === 'question_answer' ? 1 : null,
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
      };
      onChange([...slides, newSlide]);
      setSelectedIndex(slides.length);
    },
    [slides, onChange]
  );

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

  async function startRecord() {
    setPresentIndex(selectedIndex);
    setPresenting(true);
    setRecording(true);
    // Small delay so the presentation DOM renders before we start recording
    await new Promise((r) => setTimeout(r, 100));
    recorderStart();
  }

  function handleRetake() {
    setShowReviewModal(false);
    startRecord();
  }

  function handleDiscard() {
    setShowReviewModal(false);
  }

  async function handleUpload(editedBlob?: Blob) {
    const blobToUpload = editedBlob || recordedBlob;
    if (!blobToUpload || !lessonId) {
      return;
    }

    const result = await backgroundVideoUpload.startUpload({
      blob: blobToUpload,
      lessonId,
      lessonTitle: lessonTitle || 'Recording',
      onVideoReady,
    });

    if (!result.ok) {
      window.alert(result.error);
      return;
    }

    setShowReviewModal(false);
  }

  const handlePreviousWhileRecording = useCallback(() => {
    goToPreviousPresentStep();
  }, [goToPreviousPresentStep]);

  const handleNextWhileRecording = useCallback(() => {
    goToNextPresentStep();
  }, [goToNextPresentStep]);

  const handleToggleAnswerReveal = useCallback(() => {
    setShowActivityAnswer((current) => !current);
  }, []);

  // Fullscreen present mode
  if (presenting) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="flex h-full w-full items-center justify-center gap-6 px-4 py-6 lg:px-6">
          <div
            ref={slideContainerRef}
            className={`mx-auto w-full ${recording ? 'max-w-5xl lg:max-w-[min(72vw,1100px)]' : 'max-w-6xl'}`}
          >
            <SlideCard
              key={`${presentIndex}:${revealedCount}:${language}`}
              slide={slides[presentIndex]}
              language={language}
              className="!rounded-none !shadow-2xl"
              revealedCount={slides[presentIndex]?.type === 'question_answer' ? revealedCount : undefined}
              onReveal={() => setRevealedCount((c) => c + 1)}
              showActivityAnswer={isPresentActivitySlide ? showActivityAnswer : false}
            />
          </div>

          {recording && presentSpeakerNotes && (
            <aside className="hidden lg:flex w-80 shrink-0 self-stretch max-h-[calc(100vh-3rem)] flex-col rounded-3xl border border-white/15 bg-white/10 p-5 text-white shadow-2xl backdrop-blur-md">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
                  Presenter Notes
                </p>
                <p className="mt-2 text-sm font-semibold text-white/90" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  {language === 'ar' ? presentSlide?.title_ar || presentSlide?.title_en : presentSlide?.title_en || presentSlide?.title_ar}
                </p>
              </div>
              <div className="overflow-y-auto pr-1">
                <p className="whitespace-pre-wrap text-sm leading-6 text-white/90" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  {presentSpeakerNotes}
                </p>
              </div>
            </aside>
          )}
        </div>

        {/* Recording overlay (countdown, REC indicator, controls) */}
        {recording && (
          <RecordingOverlay
            recorderState={recorderState}
            countdownValue={countdownValue}
            recordingDuration={recordingDuration}
            canGoPrevious={canGoPreviousWhileRecording}
            canGoNext={canGoNextWhileRecording}
            canRevealAnswer={isPresentActivitySlide}
            isAnswerRevealed={showActivityAnswer}
            canvasRef={canvasRef}
            onPrevious={handlePreviousWhileRecording}
            onNext={handleNextWhileRecording}
            onToggleAnswer={handleToggleAnswerReveal}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onStop={recorderStop}
          />
        )}

        {/* Recording error */}
        {recorderError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm px-4 py-2 rounded-full">
            {recorderError}
          </div>
        )}

        {/* Controls overlay — hide during active recording */}
        {!recording && (
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

        {/* Slide counter during recording */}
        {recording && (recorderState === 'recording' || recorderState === 'paused') && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[55] bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
            <span className="text-white/80 text-sm font-medium">
              {presentIndex + 1} / {slides.length}
            </span>
          </div>
        )}

        {recording && presentSpeakerNotes && (
          <div className="fixed inset-x-4 bottom-24 z-[55] rounded-2xl border border-white/15 bg-black/75 p-4 text-white shadow-2xl backdrop-blur-sm lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
              Presenter Notes
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/90" dir={language === 'ar' ? 'rtl' : 'ltr'}>
              {presentSpeakerNotes}
            </p>
          </div>
        )}

        {/* Language toggle in present mode */}
        {!recording && (
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
          onSave={onSave}
          onPresent={startPresent}
          onRecord={lessonId ? startRecord : undefined}
          saving={saving}
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
                <SlideCard slide={selectedSlide} language={language} />
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
              />
            </div>
          )}
        </div>
      </div>

      {/* Recording review modal */}
      {showReviewModal && recordedBlob && (
        <RecordingReviewModal
          blob={recordedBlob}
          onUpload={handleUpload}
          onRetake={handleRetake}
          onDiscard={handleDiscard}
        />
      )}
    </>
  );
}

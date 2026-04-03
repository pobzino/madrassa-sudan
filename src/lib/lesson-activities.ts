import type { Json } from '@/lib/database.types';
import type { Slide, SlideInteractionType, SlideType } from '@/lib/slides.types';
import type {
  ChooseCorrectData,
  FillMissingWordData,
  LessonTask,
  LessonTaskForm,
  MatchPairsData,
  SequenceOrderData,
  SortGroupsData,
  SupportedTaskType,
  TapToCountData,
  TaskType,
  TrueFalseData,
} from '@/lib/tasks.types';
import { isSupportedTaskType } from '@/lib/tasks.types';
import { computeSlideInteractionCorrectness } from '@/lib/slide-interactions';

type ActivityTaskSeed = Pick<
  LessonTaskForm,
  'id' | 'timestamp_seconds' | 'timeout_seconds' | 'is_skippable' | 'required' | 'points' | 'display_order'
> | null;

type ActivityTimingTask = Pick<
  LessonTaskForm,
  'id' | 'task_type' | 'timestamp_seconds' | 'linked_slide_id' | 'display_order'
>;

export interface EffectiveActivityTiming<T extends ActivityTimingTask = ActivityTimingTask> {
  task: T;
  sourceSlide: Slide | null;
  timingMode: 'manual' | 'auto';
  effectiveTimestampSeconds: number;
  timelinePosition: number;
}

const FALLBACK_SECONDS_PER_SLIDE = 20;

export const ACTIVITY_TYPE_OPTIONS: Array<{
  type: SlideInteractionType;
  label: string;
  icon: string;
  hint: string;
}> = [
  { type: 'choose_correct', label: 'Multiple Choice', icon: '🔘', hint: 'Best for vocabulary & comprehension checks' },
  { type: 'true_false', label: 'True / False', icon: '✅', hint: 'Best for quick fact review' },
  { type: 'fill_missing_word', label: 'Fill the Blank', icon: '✏️', hint: 'Best for sentence completion & grammar' },
  { type: 'tap_to_count', label: 'Tap to Count', icon: '🔢', hint: 'Best for early math & counting practice' },
  { type: 'match_pairs', label: 'Match Pairs', icon: '🔗', hint: 'Best for linking terms to definitions' },
  { type: 'sequence_order', label: 'Put in Order', icon: '📊', hint: 'Best for steps, timelines & processes' },
  { type: 'sort_groups', label: 'Sort into Groups', icon: '📂', hint: 'Best for classification & categorization' },
];

export function normalizeTaskType(taskType: string): TaskType {
  switch (taskType) {
    case 'matching_pairs':
      return 'match_pairs';
    case 'sorting_order':
      return 'sequence_order';
    default:
      return taskType as TaskType;
  }
}

export function interactionTypeToTaskType(interactionType: SlideInteractionType): SupportedTaskType {
  return interactionType;
}

export function taskTypeToInteractionType(taskType: SupportedTaskType): SlideInteractionType {
  return taskType;
}

export function isCanonicalActivityTask(taskType: string): taskType is SupportedTaskType {
  return isSupportedTaskType(normalizeTaskType(taskType));
}

export function normalizeLessonTaskForm(
  task: Partial<LessonTaskForm> & { id: string; task_type: string }
): LessonTaskForm {
  return {
    id: task.id,
    task_type: normalizeTaskType(task.task_type),
    title_ar: task.title_ar || '',
    title_en: task.title_en || '',
    instruction_ar: task.instruction_ar || '',
    instruction_en: task.instruction_en || '',
    timestamp_seconds: task.timestamp_seconds || 0,
    task_data: (task.task_data as Record<string, unknown>) || {},
    timeout_seconds: task.timeout_seconds ?? null,
    is_skippable: task.is_skippable ?? true,
    required: task.required ?? true,
    points: task.points ?? 10,
    linked_slide_id: task.linked_slide_id ?? null,
    display_order: task.display_order ?? 0,
  };
}

export function getActivityInstructionFromSlide(slide: Slide, language: 'ar' | 'en') {
  if (language === 'ar') {
    return (
      slide.interaction_prompt_ar?.trim() ||
      slide.body_ar?.trim() ||
      slide.title_ar?.trim() ||
      ''
    );
  }

  return (
    slide.interaction_prompt_en?.trim() ||
    slide.body_en?.trim() ||
    slide.title_en?.trim() ||
    ''
  );
}

export function buildTaskDataFromSlide(slide: Slide): Record<string, unknown> | null {
  switch (slide.interaction_type) {
    case 'choose_correct':
      return {
        options_ar: slide.interaction_options_ar || [],
        options_en: slide.interaction_options_en || [],
        correct_index: slide.interaction_correct_index ?? 0,
      } satisfies ChooseCorrectData as unknown as Record<string, unknown>;
    case 'fill_missing_word':
      return {
        options_ar: slide.interaction_options_ar || [],
        options_en: slide.interaction_options_en || [],
        correct_index: slide.interaction_correct_index ?? 0,
      } satisfies FillMissingWordData as unknown as Record<string, unknown>;
    case 'true_false':
      return {
        correct_answer: slide.interaction_true_false_answer ?? true,
      } satisfies TrueFalseData as unknown as Record<string, unknown>;
    case 'tap_to_count':
      return {
        count_target: slide.interaction_count_target ?? 1,
        visual_emoji: slide.interaction_visual_emoji ?? '🍎',
      } satisfies TapToCountData as unknown as Record<string, unknown>;
    case 'match_pairs':
      return {
        pairs: (slide.interaction_items_ar || []).map((leftAr, index) => ({
          id: `pair-${index + 1}`,
          left_ar: leftAr,
          left_en: slide.interaction_items_en?.[index] || '',
          right_ar: slide.interaction_targets_ar?.[index] || '',
          right_en: slide.interaction_targets_en?.[index] || '',
        })),
        shuffle_right: true,
      } satisfies MatchPairsData as unknown as Record<string, unknown>;
    case 'sequence_order':
      return {
        items: (slide.interaction_items_ar || []).map((textAr, index) => ({
          id: `step-${index + 1}`,
          text_ar: textAr,
          text_en: slide.interaction_items_en?.[index] || '',
          correct_position: index,
        })),
        instruction_type: 'custom',
      } satisfies SequenceOrderData as unknown as Record<string, unknown>;
    case 'sort_groups':
      return {
        groups_ar: slide.interaction_targets_ar || [],
        groups_en: slide.interaction_targets_en || [],
        items: (slide.interaction_items_ar || []).map((textAr, index) => ({
          id: `item-${index + 1}`,
          text_ar: textAr,
          text_en: slide.interaction_items_en?.[index] || '',
          group_index: slide.interaction_solution_map?.[index] ?? 0,
        })),
      } satisfies SortGroupsData as unknown as Record<string, unknown>;
    default:
      return null;
  }
}

function getDraftActivityContent(interactionType: SlideInteractionType) {
  switch (interactionType) {
    case 'choose_correct':
      return {
        title_ar: 'نشاط اختيار من متعدد',
        title_en: 'Multiple Choice Activity',
        body_ar: 'اختر الإجابة الصحيحة.',
        body_en: 'Choose the correct answer.',
        prompt_ar: 'اختر الإجابة الصحيحة.',
        prompt_en: 'Choose the correct answer.',
        options_ar: ['الخيار 1', 'الخيار 2', 'الخيار 3'],
        options_en: ['Option 1', 'Option 2', 'Option 3'],
        correct_index: 0,
      };
    case 'true_false':
      return {
        title_ar: 'نشاط صح أم خطأ',
        title_en: 'True / False Activity',
        body_ar: 'اختر صح أو خطأ.',
        body_en: 'Choose true or false.',
        prompt_ar: 'هل العبارة صحيحة؟',
        prompt_en: 'Is the statement true?',
        true_false_answer: true,
      };
    case 'fill_missing_word':
      return {
        title_ar: 'نشاط أكمل الفراغ',
        title_en: 'Fill the Blank Activity',
        body_ar: 'اختر الكلمة التي تكمل الجملة.',
        body_en: 'Choose the word that completes the sentence.',
        prompt_ar: 'أكمل الجملة بالكلمة الصحيحة.',
        prompt_en: 'Complete the sentence with the correct word.',
        options_ar: ['كلمة 1', 'كلمة 2', 'كلمة 3'],
        options_en: ['Word 1', 'Word 2', 'Word 3'],
        correct_index: 0,
      };
    case 'tap_to_count':
      return {
        title_ar: 'نشاط العد',
        title_en: 'Tap to Count Activity',
        body_ar: 'اضغط على العناصر ثم عدّها.',
        body_en: 'Tap the items and count them.',
        prompt_ar: 'كم عنصراً ترى؟',
        prompt_en: 'How many items do you see?',
        count_target: 5,
        visual_emoji: '🍎',
      };
    case 'match_pairs':
      return {
        title_ar: 'نشاط التوصيل',
        title_en: 'Match Pairs Activity',
        body_ar: 'صل كل عنصر بما يناسبه.',
        body_en: 'Match each item to its pair.',
        prompt_ar: 'صل العناصر المتطابقة.',
        prompt_en: 'Match the pairs.',
        items_ar: ['عنصر 1', 'عنصر 2'],
        items_en: ['Item 1', 'Item 2'],
        targets_ar: ['تطابق 1', 'تطابق 2'],
        targets_en: ['Match 1', 'Match 2'],
      };
    case 'sequence_order':
      return {
        title_ar: 'نشاط الترتيب',
        title_en: 'Sequence Activity',
        body_ar: 'رتب العناصر بالترتيب الصحيح.',
        body_en: 'Put the items in the correct order.',
        prompt_ar: 'رتب الخطوات.',
        prompt_en: 'Put the steps in order.',
        items_ar: ['الخطوة الأولى', 'الخطوة الثانية', 'الخطوة الثالثة'],
        items_en: ['First step', 'Second step', 'Third step'],
      };
    case 'sort_groups':
      return {
        title_ar: 'نشاط التصنيف',
        title_en: 'Sort into Groups Activity',
        body_ar: 'ضع كل عنصر في المجموعة الصحيحة.',
        body_en: 'Place each item into the correct group.',
        prompt_ar: 'صنف العناصر.',
        prompt_en: 'Sort the items.',
        items_ar: ['عنصر 1', 'عنصر 2'],
        items_en: ['Item 1', 'Item 2'],
        targets_ar: ['المجموعة 1', 'المجموعة 2'],
        targets_en: ['Group 1', 'Group 2'],
        solution_map: [0, 1],
      };
  }
}

export function createDraftActivitySlide(
  interactionType: SlideInteractionType,
  sequence: number
): Slide {
  const activityId = crypto.randomUUID();
  const content = getDraftActivityContent(interactionType);

  return {
    id: crypto.randomUUID(),
    type: 'activity',
    sequence,
    is_required: false,
    timestamp_seconds: null,
    title_ar: content.title_ar,
    title_en: content.title_en,
    body_ar: content.body_ar,
    body_en: content.body_en,
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
    activity_id: activityId,
    interaction_type: interactionType,
    interaction_prompt_ar: content.prompt_ar,
    interaction_prompt_en: content.prompt_en,
    interaction_options_ar: 'options_ar' in content ? content.options_ar : null,
    interaction_options_en: 'options_en' in content ? content.options_en : null,
    interaction_correct_index: 'correct_index' in content ? content.correct_index : null,
    interaction_true_false_answer: 'true_false_answer' in content ? content.true_false_answer : null,
    interaction_count_target: 'count_target' in content ? content.count_target : null,
    interaction_visual_emoji: 'visual_emoji' in content ? content.visual_emoji : null,
    interaction_items_ar: 'items_ar' in content ? content.items_ar : null,
    interaction_items_en: 'items_en' in content ? content.items_en : null,
    interaction_targets_ar: 'targets_ar' in content ? content.targets_ar : null,
    interaction_targets_en: 'targets_en' in content ? content.targets_en : null,
    interaction_solution_map: 'solution_map' in content ? content.solution_map : null,
  };
}

export function buildLessonTaskFormFromSlide(
  slide: Slide,
  seed: ActivityTaskSeed = null
): LessonTaskForm | null {
  if (!slide.interaction_type || !isCanonicalActivityTask(slide.interaction_type)) {
    return null;
  }

  const taskData = buildTaskDataFromSlide(slide);

  if (!taskData) {
    return null;
  }

  return {
    id: slide.activity_id || seed?.id || crypto.randomUUID(),
    task_type: interactionTypeToTaskType(slide.interaction_type),
    title_ar: slide.title_ar || '',
    title_en: slide.title_en || '',
    instruction_ar: getActivityInstructionFromSlide(slide, 'ar'),
    instruction_en: getActivityInstructionFromSlide(slide, 'en'),
    timestamp_seconds:
      typeof slide.timestamp_seconds === 'number'
        ? slide.timestamp_seconds
        : seed?.timestamp_seconds || 0,
    task_data: taskData,
    timeout_seconds: seed?.timeout_seconds ?? null,
    is_skippable: seed?.is_skippable ?? true,
    required: seed?.required ?? true,
    points: seed?.points ?? 10,
    linked_slide_id: slide.id,
    display_order: seed?.display_order ?? slide.sequence,
  };
}

function getOptionsFromTaskData(taskData: Record<string, unknown>, language: 'ar' | 'en') {
  const key = language === 'ar' ? 'options_ar' : 'options_en';
  const fallbackKey = language === 'ar' ? 'options_en' : 'options_ar';

  return ((taskData[key] as string[] | undefined) ||
    (taskData[fallbackKey] as string[] | undefined) ||
    []) as string[];
}

export function buildSlideUpdatesFromTask(task: Pick<
  LessonTaskForm,
  'id' | 'task_type' | 'title_ar' | 'title_en' | 'instruction_ar' | 'instruction_en' | 'timestamp_seconds' | 'task_data'
>): Partial<Slide> {
  const normalizedType = normalizeTaskType(task.task_type);

  if (!isCanonicalActivityTask(normalizedType)) {
    return {};
  }

  const updates: Partial<Slide> = {
    activity_id: task.id,
    type: 'activity',
    lesson_phase: 'practice',
    timestamp_seconds: task.timestamp_seconds > 0 ? task.timestamp_seconds : null,
    title_ar: task.title_ar,
    title_en: task.title_en,
    body_ar: task.instruction_ar,
    body_en: task.instruction_en,
    interaction_type: taskTypeToInteractionType(normalizedType),
    interaction_prompt_ar: task.instruction_ar,
    interaction_prompt_en: task.instruction_en,
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

  switch (normalizedType) {
    case 'choose_correct':
    case 'fill_missing_word':
      updates.interaction_options_ar = getOptionsFromTaskData(task.task_data, 'ar');
      updates.interaction_options_en = getOptionsFromTaskData(task.task_data, 'en');
      updates.interaction_correct_index = Number(task.task_data.correct_index ?? 0);
      break;
    case 'true_false':
      updates.interaction_true_false_answer = Boolean(task.task_data.correct_answer);
      break;
    case 'tap_to_count':
      updates.interaction_count_target = Number(task.task_data.count_target ?? 1);
      updates.interaction_visual_emoji = String(task.task_data.visual_emoji || '🍎');
      break;
    case 'match_pairs': {
      const pairs = (task.task_data.pairs as MatchPairsData['pairs'] | undefined) || [];
      if (pairs.length > 0) {
        updates.interaction_items_ar = pairs.map((pair) => pair.left_ar);
        updates.interaction_items_en = pairs.map((pair) => pair.left_en || '');
        updates.interaction_targets_ar = pairs.map((pair) => pair.right_ar);
        updates.interaction_targets_en = pairs.map((pair) => pair.right_en || '');
      } else {
        updates.interaction_items_ar = (task.task_data.items_ar as string[] | undefined) || [];
        updates.interaction_items_en = (task.task_data.items_en as string[] | undefined) || [];
        updates.interaction_targets_ar = (task.task_data.targets_ar as string[] | undefined) || [];
        updates.interaction_targets_en = (task.task_data.targets_en as string[] | undefined) || [];
      }
      break;
    }
    case 'sequence_order': {
      const items = ((task.task_data.items as SequenceOrderData['items'] | undefined) || [])
        .slice()
        .sort((left, right) => left.correct_position - right.correct_position);
      if (items.length > 0) {
        updates.interaction_items_ar = items.map((item) => item.text_ar);
        updates.interaction_items_en = items.map((item) => item.text_en || '');
      } else {
        updates.interaction_items_ar = (task.task_data.items_ar as string[] | undefined) || [];
        updates.interaction_items_en = (task.task_data.items_en as string[] | undefined) || [];
      }
      break;
    }
    case 'sort_groups': {
      const items = (task.task_data.items as SortGroupsData['items'] | undefined) || [];
      if (items.length > 0) {
        updates.interaction_items_ar = items.map((item) => item.text_ar);
        updates.interaction_items_en = items.map((item) => item.text_en || '');
        updates.interaction_targets_ar = (task.task_data.groups_ar as string[] | undefined) || [];
        updates.interaction_targets_en = (task.task_data.groups_en as string[] | undefined) || [];
        updates.interaction_solution_map = items.map((item) => item.group_index);
      } else {
        updates.interaction_items_ar = (task.task_data.items_ar as string[] | undefined) || [];
        updates.interaction_items_en = (task.task_data.items_en as string[] | undefined) || [];
        updates.interaction_targets_ar = (task.task_data.groups_ar as string[] | undefined) || [];
        updates.interaction_targets_en = (task.task_data.groups_en as string[] | undefined) || [];
        updates.interaction_solution_map = (task.task_data.solution_map as number[] | undefined) || [];
      }
      break;
    }
  }

  return updates;
}

export function applyTaskToSlide(slide: Slide, task: Pick<
  LessonTaskForm,
  'id' | 'task_type' | 'title_ar' | 'title_en' | 'instruction_ar' | 'instruction_en' | 'timestamp_seconds' | 'task_data'
>): Slide {
  return {
    ...slide,
    ...buildSlideUpdatesFromTask(task),
  };
}

export function createActivitySlideFromTask(
  task: Pick<
    LessonTaskForm,
    'id' | 'task_type' | 'title_ar' | 'title_en' | 'instruction_ar' | 'instruction_en' | 'timestamp_seconds' | 'task_data'
  >,
  sequence: number,
  slideId?: string
): Slide | null {
  const normalizedType = normalizeTaskType(task.task_type);
  if (!isCanonicalActivityTask(normalizedType)) {
    return null;
  }

  const slideType: SlideType = 'activity';

  return {
    id: slideId || crypto.randomUUID(),
    sequence,
    type: slideType,
    is_required: true,
    timestamp_seconds: task.timestamp_seconds > 0 ? task.timestamp_seconds : null,
    title_ar: task.title_ar,
    title_en: task.title_en,
    body_ar: task.instruction_ar,
    body_en: task.instruction_en,
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
    ...buildSlideUpdatesFromTask(task),
  };
}

function clampTimelinePosition(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function getFallbackDurationSeconds(slides: Slide[], videoDurationSeconds: number | null) {
  if (videoDurationSeconds && Number.isFinite(videoDurationSeconds) && videoDurationSeconds > 0) {
    return Math.round(videoDurationSeconds);
  }

  return Math.max(60, slides.length * FALLBACK_SECONDS_PER_SLIDE);
}

export function getSlideTimelinePosition(slides: Slide[], slideId: string | null | undefined): number | null {
  if (!slideId || slides.length === 0) {
    return null;
  }

  const slideIndex = slides.findIndex((slide) => slide.id === slideId);
  if (slideIndex < 0) {
    return null;
  }

  if (slides.length === 1) {
    return 0.5;
  }

  return clampTimelinePosition(slideIndex / (slides.length - 1));
}

export function resolveEffectiveActivityTiming<T extends ActivityTimingTask>(
  task: T,
  slides: Slide[],
  videoDurationSeconds: number | null
): EffectiveActivityTiming<T> {
  const sourceSlide =
    (task.linked_slide_id && slides.find((slide) => slide.id === task.linked_slide_id)) || null;
  const manualTimestamp = Number(task.timestamp_seconds ?? 0);

  if (manualTimestamp > 0) {
    const duration = getFallbackDurationSeconds(slides, videoDurationSeconds);
    return {
      task,
      sourceSlide,
      timingMode: 'manual',
      effectiveTimestampSeconds: Math.round(manualTimestamp),
      timelinePosition: clampTimelinePosition(duration > 0 ? manualTimestamp / duration : 0),
    };
  }

  const duration = getFallbackDurationSeconds(slides, videoDurationSeconds);
  const linkedSlidePosition = getSlideTimelinePosition(slides, task.linked_slide_id);
  const activityTasks = slides
    .filter((slide) => slide.interaction_type && isCanonicalActivityTask(slide.interaction_type))
    .sort((left, right) => left.sequence - right.sequence);
  const sourceSlideIndex = sourceSlide
    ? activityTasks.findIndex((slide) => slide.id === sourceSlide.id)
    : -1;
  const activityPosition =
    sourceSlideIndex >= 0 && activityTasks.length > 1
      ? sourceSlideIndex / (activityTasks.length - 1)
      : sourceSlideIndex === 0
        ? 0.5
        : null;
  const timelinePosition = clampTimelinePosition(
    linkedSlidePosition ?? activityPosition ?? 0
  );

  return {
    task,
    sourceSlide,
    timingMode: 'auto',
    effectiveTimestampSeconds: Math.round(duration * timelinePosition),
    timelinePosition,
  };
}

export function getEffectiveActivityTimings<T extends ActivityTimingTask>(
  slides: Slide[],
  tasks: T[],
  videoDurationSeconds: number | null
): Array<EffectiveActivityTiming<T>> {
  return tasks
    .filter((task) => isCanonicalActivityTask(task.task_type))
    .map((task) => resolveEffectiveActivityTiming(task, slides, videoDurationSeconds))
    .sort((left, right) => {
      if (left.effectiveTimestampSeconds !== right.effectiveTimestampSeconds) {
        return left.effectiveTimestampSeconds - right.effectiveTimestampSeconds;
      }

      if (left.sourceSlide && right.sourceSlide && left.sourceSlide.sequence !== right.sourceSlide.sequence) {
        return left.sourceSlide.sequence - right.sourceSlide.sequence;
      }

      return left.task.display_order - right.task.display_order;
    });
}

export function buildActivityInteractionSlide(
  task: Pick<
    LessonTask,
    'id' | 'task_type' | 'title_ar' | 'title_en' | 'instruction_ar' | 'instruction_en' | 'timestamp_seconds' | 'task_data' | 'linked_slide_id'
  >,
  sourceSlide?: Slide | null
): Slide | null {
  const normalizedType = normalizeTaskType(task.task_type);
  if (!isCanonicalActivityTask(normalizedType)) {
    return null;
  }

  if (sourceSlide) {
    return applyTaskToSlide(sourceSlide, {
      id: task.id,
      task_type: normalizedType,
      title_ar: task.title_ar,
      title_en: task.title_en || '',
      instruction_ar: task.instruction_ar,
      instruction_en: task.instruction_en || '',
      timestamp_seconds: task.timestamp_seconds,
      task_data: task.task_data,
    });
  }

  return createActivitySlideFromTask(
    {
      id: task.id,
      task_type: normalizedType,
      title_ar: task.title_ar,
      title_en: task.title_en || '',
      instruction_ar: task.instruction_ar,
      instruction_en: task.instruction_en || '',
      timestamp_seconds: task.timestamp_seconds,
      task_data: task.task_data,
    },
    0,
    task.linked_slide_id || undefined
  );
}

export function computeActivityScore(
  taskType: TaskType,
  taskData: Record<string, unknown>,
  answer: boolean | number | string | string[] | null
): number {
  const normalizedType = normalizeTaskType(taskType);

  if (!isCanonicalActivityTask(normalizedType)) {
    if (normalizedType === 'drawing_tracing' || normalizedType === 'audio_recording') {
      return 1;
    }
    return 0;
  }

  const syntheticSlide = buildActivityInteractionSlide(
    {
      id: 'synthetic',
      linked_slide_id: null,
      task_type: normalizedType,
      title_ar: '',
      title_en: '',
      instruction_ar: '',
      instruction_en: '',
      timestamp_seconds: 0,
      task_data,
    },
    null
  );

  if (!syntheticSlide) {
    return 0;
  }

  return computeSlideInteractionCorrectness(syntheticSlide, answer) ? 1 : 0;
}

export function toStoredActivityResponse(answer: boolean | number | string | string[] | null): Json {
  return { answer };
}

export function readAnswerFromTaskResponse(responseData: Record<string, unknown>): boolean | number | string | string[] | null {
  const answer = responseData.answer;

  if (
    answer === null ||
    typeof answer === 'boolean' ||
    typeof answer === 'number' ||
    typeof answer === 'string'
  ) {
    return answer;
  }

  if (Array.isArray(answer) && answer.every((value) => typeof value === 'string')) {
    return answer;
  }

  return null;
}

function sortTaskForms(left: LessonTaskForm, right: LessonTaskForm) {
  if (left.timestamp_seconds !== right.timestamp_seconds) {
    return left.timestamp_seconds - right.timestamp_seconds;
  }

  if (left.display_order !== right.display_order) {
    return left.display_order - right.display_order;
  }

  return left.title_ar.localeCompare(right.title_ar);
}

export function syncTaskFormsFromSlides(
  slides: Slide[],
  currentTasks: LessonTaskForm[]
): LessonTaskForm[] {
  const existingTasks = currentTasks.map(normalizeLessonTaskForm);
  const activityTasksById = new Map(existingTasks.map((task) => [task.id, task]));
  const activityTasksBySlideId = new Map(
    existingTasks
      .filter((task) => task.linked_slide_id)
      .map((task) => [task.linked_slide_id as string, task])
  );

  const supportedActivities = slides
    .filter((slide) => slide.interaction_type && isCanonicalActivityTask(slide.interaction_type))
    .map((slide, index) =>
      buildLessonTaskFormFromSlide(
        slide,
        activityTasksById.get(slide.activity_id || '') ||
          activityTasksBySlideId.get(slide.id) || {
            id: slide.activity_id || crypto.randomUUID(),
            timestamp_seconds:
              typeof slide.timestamp_seconds === 'number' ? slide.timestamp_seconds : 0,
            timeout_seconds: null,
            is_skippable: true,
            required: true,
            points: 10,
            display_order: index,
          }
      )
    )
    .filter((task): task is LessonTaskForm => Boolean(task))
    .map((task, index) => ({
      ...task,
      display_order: index,
    }));

  const linkedSupportedTaskIds = new Set(supportedActivities.map((task) => task.id));
  const preservedTasks = existingTasks.filter((task) => {
    if (linkedSupportedTaskIds.has(task.id)) {
      return false;
    }

    return !isCanonicalActivityTask(task.task_type) || !task.linked_slide_id;
  });

  return [...supportedActivities, ...preservedTasks].sort(sortTaskForms);
}

export function ensureSlidesForSupportedTasks(
  slides: Slide[],
  tasks: LessonTaskForm[]
): Slide[] {
  const nextSlides = slides.map((slide) => ({ ...slide }));
  const slideIds = new Set(nextSlides.map((slide) => slide.id));
  const slideByActivityId = new Map(
    nextSlides
      .filter((slide) => slide.activity_id)
      .map((slide) => [slide.activity_id as string, slide])
  );

  for (const task of tasks.map(normalizeLessonTaskForm)) {
    if (!isCanonicalActivityTask(task.task_type)) {
      continue;
    }

    const linkedSlide =
      (task.linked_slide_id && nextSlides.find((slide) => slide.id === task.linked_slide_id)) ||
      slideByActivityId.get(task.id);

    if (linkedSlide) {
      const slideIndex = nextSlides.findIndex((slide) => slide.id === linkedSlide.id);
      nextSlides[slideIndex] = applyTaskToSlide(nextSlides[slideIndex], task);
      continue;
    }

    const createdSlide = createActivitySlideFromTask(task, nextSlides.length, task.linked_slide_id || undefined);

    if (!createdSlide || slideIds.has(createdSlide.id)) {
      continue;
    }

    nextSlides.push(createdSlide);
    slideIds.add(createdSlide.id);
  }

  return nextSlides.map((slide, index) => ({
    ...slide,
    sequence: index,
  }));
}

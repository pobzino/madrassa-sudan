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
    timestamp_seconds: task.timestamp_seconds,
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
    timestamp_seconds: task.timestamp_seconds,
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

import { describe, expect, it } from 'vitest';
import {
  ensureSlidesForSupportedTasks,
  getActivityInstructionFromSlide,
  syncTaskFormsFromSlides,
} from '@/lib/lesson-activities';
import type { LessonTaskForm } from '@/lib/tasks.types';
import type { Slide } from '@/lib/slides.types';

function makeActivitySlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: 'slide-1',
    type: 'activity',
    sequence: 0,
    is_required: false,
    timestamp_seconds: null,
    title_ar: 'نشاط',
    title_en: 'Activity',
    body_ar: 'Body AR',
    body_en: 'Body EN',
    speaker_notes_ar: '',
    speaker_notes_en: '',
    visual_hint: '',
    bullets_ar: null,
    bullets_en: null,
    reveal_items_ar: null,
    reveal_items_en: null,
    image_url: null,
    image_fit: 'contain',
    image_position_x: 50,
    image_position_y: 50,
    image_zoom: 1,
    layout: null,
    title_size: 'md',
    body_size: 'md',
    lesson_phase: 'practice',
    activity_id: 'task-1',
    interaction_type: 'choose_correct',
    interaction_prompt_ar: 'Prompt AR',
    interaction_prompt_en: 'Prompt EN',
    interaction_expected_answer_ar: null,
    interaction_expected_answer_en: null,
    interaction_options_ar: ['أ', 'ب'],
    interaction_options_en: ['A', 'B'],
    interaction_correct_index: 0,
    interaction_true_false_answer: null,
    interaction_count_target: null,
    interaction_visual_emoji: null,
    interaction_items_ar: null,
    interaction_items_en: null,
    interaction_targets_ar: null,
    interaction_targets_en: null,
    interaction_solution_map: null,
    interaction_free_entry: null,
    ...overrides,
  } as Slide;
}

function makeTask(overrides: Partial<LessonTaskForm> = {}): LessonTaskForm {
  return {
    id: 'task-1',
    task_type: 'choose_correct',
    title_ar: 'Task AR',
    title_en: 'Task EN',
    instruction_ar: 'Instruction AR',
    instruction_en: 'Instruction EN',
    timestamp_seconds: 0,
    task_data: {
      options_ar: ['أ', 'ب'],
      options_en: ['A', 'B'],
      correct_index: 0,
    },
    timeout_seconds: null,
    is_skippable: true,
    required: true,
    points: 10,
    linked_slide_id: 'slide-1',
    display_order: 0,
    ...overrides,
  };
}

describe('lesson activity slide sync', () => {
  it('uses the edited visible body as the activity instruction', () => {
    const slide = makeActivitySlide({
      body_ar: 'Edited first line\nEdited second line',
      body_en: 'Edited English body',
      interaction_prompt_ar: 'Original Arabic prompt',
      interaction_prompt_en: 'Original English prompt',
    });

    expect(getActivityInstructionFromSlide(slide, 'ar')).toBe('Edited first line\nEdited second line');
    expect(getActivityInstructionFromSlide(slide, 'en')).toBe('Edited English body');
  });

  it('round-trips edited body, prompt, and speaker notes without reverting body from the old prompt', () => {
    const slide = makeActivitySlide({
      body_ar: 'Edited first line\nEdited second line',
      body_en: 'Edited English body',
      interaction_prompt_ar: 'Keep separate Arabic prompt',
      interaction_prompt_en: 'Keep separate English prompt',
      speaker_notes_ar: 'Arabic note\nwith another line',
      speaker_notes_en: 'English note\nwith another line',
    });

    const tasks = syncTaskFormsFromSlides([slide], []);

    expect(tasks[0].instruction_ar).toBe('Edited first line\nEdited second line');
    expect(tasks[0].instruction_en).toBe('Edited English body');
    expect(tasks[0].task_data.prompt_ar).toBe('Keep separate Arabic prompt');
    expect(tasks[0].task_data.prompt_en).toBe('Keep separate English prompt');

    const [syncedSlide] = ensureSlidesForSupportedTasks([slide], tasks);

    expect(syncedSlide.body_ar).toBe('Edited first line\nEdited second line');
    expect(syncedSlide.body_en).toBe('Edited English body');
    expect(syncedSlide.interaction_prompt_ar).toBe('Keep separate Arabic prompt');
    expect(syncedSlide.interaction_prompt_en).toBe('Keep separate English prompt');
    expect(syncedSlide.speaker_notes_ar).toBe('Arabic note\nwith another line');
    expect(syncedSlide.speaker_notes_en).toBe('English note\nwith another line');
  });

  it('falls back to task instructions as prompts for older saved tasks', () => {
    const slide = makeActivitySlide({
      interaction_prompt_ar: 'Existing prompt',
      interaction_prompt_en: 'Existing prompt EN',
    });
    const legacyTask = makeTask({
      instruction_ar: 'Legacy instruction AR',
      instruction_en: 'Legacy instruction EN',
      task_data: {
        options_ar: ['أ', 'ب'],
        options_en: ['A', 'B'],
        correct_index: 1,
      },
    });

    const [syncedSlide] = ensureSlidesForSupportedTasks([slide], [legacyTask]);

    expect(syncedSlide.body_ar).toBe('Legacy instruction AR');
    expect(syncedSlide.body_en).toBe('Legacy instruction EN');
    expect(syncedSlide.interaction_prompt_ar).toBe('Legacy instruction AR');
    expect(syncedSlide.interaction_prompt_en).toBe('Legacy instruction EN');
  });
});

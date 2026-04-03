WITH slide_activity_ids AS (
  SELECT
    lesson_id,
    slide->>'id' AS slide_id,
    slide->>'activity_id' AS activity_id
  FROM lesson_slides
  CROSS JOIN LATERAL jsonb_array_elements(slides) AS slide
  WHERE COALESCE(slide->>'activity_id', '') <> ''
)
UPDATE lesson_tasks AS task
SET linked_slide_id = slide_activity_ids.slide_id
FROM slide_activity_ids
WHERE task.lesson_id = slide_activity_ids.lesson_id
  AND task.id::text = slide_activity_ids.activity_id
  AND COALESCE(task.linked_slide_id, '') <> slide_activity_ids.slide_id;

CREATE TEMP TABLE _activity_backfill (
  lesson_id UUID NOT NULL,
  slide_id TEXT NOT NULL,
  task_id UUID NOT NULL,
  sequence_index INTEGER NOT NULL,
  slide JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _activity_backfill (lesson_id, slide_id, task_id, sequence_index, slide)
SELECT
  deck.lesson_id,
  slide->>'id' AS slide_id,
  CASE
    WHEN COALESCE(slide->>'activity_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (slide->>'activity_id')::uuid
    ELSE gen_random_uuid()
  END AS task_id,
  ordinality::INTEGER - 1 AS sequence_index,
  slide
FROM lesson_slides AS deck
CROSS JOIN LATERAL jsonb_array_elements(deck.slides) WITH ORDINALITY AS entry(slide, ordinality)
WHERE COALESCE(slide->>'interaction_type', '') IN (
    'choose_correct',
    'true_false',
    'fill_missing_word',
    'tap_to_count',
    'match_pairs',
    'sequence_order',
    'sort_groups'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM lesson_tasks AS task
    WHERE task.lesson_id = deck.lesson_id
      AND (
        task.linked_slide_id = slide->>'id'
        OR (
          COALESCE(slide->>'activity_id', '') <> ''
          AND task.id::text = slide->>'activity_id'
        )
      )
  );

INSERT INTO lesson_tasks (
  id,
  lesson_id,
  task_type,
  title_ar,
  title_en,
  instruction_ar,
  instruction_en,
  timestamp_seconds,
  display_order,
  task_data,
  timeout_seconds,
  is_skippable,
  required,
  linked_slide_id,
  points
)
SELECT
  task_id,
  lesson_id,
  CASE slide->>'interaction_type'
    WHEN 'choose_correct' THEN 'choose_correct'::task_type
    WHEN 'true_false' THEN 'true_false'::task_type
    WHEN 'fill_missing_word' THEN 'fill_missing_word'::task_type
    WHEN 'tap_to_count' THEN 'tap_to_count'::task_type
    WHEN 'match_pairs' THEN 'match_pairs'::task_type
    WHEN 'sequence_order' THEN 'sequence_order'::task_type
    WHEN 'sort_groups' THEN 'sort_groups'::task_type
  END,
  COALESCE(NULLIF(slide->>'title_ar', ''), NULLIF(slide->>'body_ar', ''), 'نشاط تفاعلي'),
  COALESCE(NULLIF(slide->>'title_en', ''), NULLIF(slide->>'body_en', ''), 'Interactive Activity'),
  COALESCE(NULLIF(slide->>'interaction_prompt_ar', ''), NULLIF(slide->>'body_ar', ''), NULLIF(slide->>'title_ar', ''), 'أكمل النشاط'),
  COALESCE(NULLIF(slide->>'interaction_prompt_en', ''), NULLIF(slide->>'body_en', ''), NULLIF(slide->>'title_en', ''), 'Complete the activity'),
  COALESCE((slide->>'timestamp_seconds')::INTEGER, 0),
  sequence_index,
  CASE slide->>'interaction_type'
    WHEN 'choose_correct' THEN jsonb_build_object(
      'options_ar', COALESCE(slide->'interaction_options_ar', '[]'::jsonb),
      'options_en', COALESCE(slide->'interaction_options_en', '[]'::jsonb),
      'correct_index', COALESCE((slide->>'interaction_correct_index')::INTEGER, 0)
    )
    WHEN 'fill_missing_word' THEN jsonb_build_object(
      'options_ar', COALESCE(slide->'interaction_options_ar', '[]'::jsonb),
      'options_en', COALESCE(slide->'interaction_options_en', '[]'::jsonb),
      'correct_index', COALESCE((slide->>'interaction_correct_index')::INTEGER, 0)
    )
    WHEN 'true_false' THEN jsonb_build_object(
      'correct_answer', COALESCE((slide->>'interaction_true_false_answer')::BOOLEAN, true)
    )
    WHEN 'tap_to_count' THEN jsonb_build_object(
      'count_target', COALESCE((slide->>'interaction_count_target')::INTEGER, 1),
      'visual_emoji', COALESCE(slide->>'interaction_visual_emoji', '🍎')
    )
    WHEN 'match_pairs' THEN jsonb_build_object(
      'items_ar', COALESCE(slide->'interaction_items_ar', '[]'::jsonb),
      'items_en', COALESCE(slide->'interaction_items_en', '[]'::jsonb),
      'targets_ar', COALESCE(slide->'interaction_targets_ar', '[]'::jsonb),
      'targets_en', COALESCE(slide->'interaction_targets_en', '[]'::jsonb)
    )
    WHEN 'sequence_order' THEN jsonb_build_object(
      'items_ar', COALESCE(slide->'interaction_items_ar', '[]'::jsonb),
      'items_en', COALESCE(slide->'interaction_items_en', '[]'::jsonb),
      'instruction_type', 'custom'
    )
    WHEN 'sort_groups' THEN jsonb_build_object(
      'items_ar', COALESCE(slide->'interaction_items_ar', '[]'::jsonb),
      'items_en', COALESCE(slide->'interaction_items_en', '[]'::jsonb),
      'groups_ar', COALESCE(slide->'interaction_targets_ar', '[]'::jsonb),
      'groups_en', COALESCE(slide->'interaction_targets_en', '[]'::jsonb),
      'solution_map', COALESCE(slide->'interaction_solution_map', '[]'::jsonb)
    )
  END,
  NULL,
  true,
  COALESCE((slide->>'is_required')::BOOLEAN, true),
  slide_id,
  10
FROM _activity_backfill;

UPDATE lesson_slides AS deck
SET slides = patched.slides
FROM (
  SELECT
    deck.lesson_id,
    jsonb_agg(
      CASE
        WHEN backfill.slide_id IS NOT NULL THEN jsonb_set(entry.slide, '{activity_id}', to_jsonb(backfill.task_id::TEXT), true)
        ELSE entry.slide
      END
      ORDER BY entry.ordinality
    ) AS slides
  FROM lesson_slides AS deck
  CROSS JOIN LATERAL jsonb_array_elements(deck.slides) WITH ORDINALITY AS entry(slide, ordinality)
  LEFT JOIN _activity_backfill AS backfill
    ON backfill.lesson_id = deck.lesson_id
   AND backfill.slide_id = entry.slide->>'id'
  GROUP BY deck.lesson_id
) AS patched
WHERE deck.lesson_id = patched.lesson_id
  AND EXISTS (
    SELECT 1
    FROM _activity_backfill AS backfill
    WHERE backfill.lesson_id = deck.lesson_id
  );

WITH task_rollup AS (
  SELECT
    task.lesson_id,
    response.student_id,
    COUNT(*) FILTER (WHERE response.status = 'completed') AS tasks_completed,
    COUNT(*) FILTER (WHERE response.status = 'completed' AND task.required) AS required_tasks_completed,
    COUNT(*) FILTER (WHERE response.status IN ('skipped', 'timed_out')) AS tasks_skipped,
    COALESCE(SUM(response.completion_score), 0) AS tasks_total_score
  FROM lesson_task_responses AS response
  JOIN lesson_tasks AS task
    ON task.id = response.task_id
  GROUP BY task.lesson_id, response.student_id
)
INSERT INTO lesson_progress (
  student_id,
  lesson_id,
  tasks_completed,
  required_tasks_completed,
  tasks_skipped,
  tasks_total_score
)
SELECT
  task_rollup.student_id,
  task_rollup.lesson_id,
  task_rollup.tasks_completed,
  task_rollup.required_tasks_completed,
  task_rollup.tasks_skipped,
  task_rollup.tasks_total_score
FROM task_rollup
ON CONFLICT (student_id, lesson_id) DO UPDATE
SET tasks_completed = EXCLUDED.tasks_completed,
    required_tasks_completed = EXCLUDED.required_tasks_completed,
    tasks_skipped = EXCLUDED.tasks_skipped,
    tasks_total_score = EXCLUDED.tasks_total_score;

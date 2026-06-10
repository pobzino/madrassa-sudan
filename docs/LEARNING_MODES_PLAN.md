# Cohort-Based and Independent Learning Plan

**Status:** Proposed implementation plan
**Created:** 2026-05-02
**Scope:** Amal Madrassa teacher-led cohorts, prerecord lesson readiness tracking, homework tracking, and future independent sequential learning paths.

---

## 1. Executive Summary

Amal Madrassa should support two learning modes that share the same lesson, quiz, homework, and progress foundations:

1. **Cohort-Based Learning:** A fixed 12-week programme managed by Amal Teachers. Students belong to a cohort/class, teachers schedule Math and English lessons week by week, students watch prerecorded lessons before live practice sessions, and teachers track who watched, attempted quizzes, and submitted homework.
2. **Independent Learning:** A self-managed, Duolingo-style sequence where students unlock lessons week by week or step by step after completing required prior work.

The current codebase is closer to cohort-based learning than independent learning. Cohorts, cohort lesson visibility, homework assignments, multiple-teacher membership, and lesson/quiz progress already exist. The main missing pieces are a 12-week schedule model, a readiness dashboard, teacher rota UI, and explicit sequencing/unlock logic.

Recommendation: **build cohort mode first**, then build independent learning as a separate path layer on top of the same lesson/progress system.

---

## 2. Goals

### Cohort-Based Learning Goals

- Run fixed-period 12-week cohorts managed by Amal Teachers.
- Support one cohort as one class across subjects such as English and Math.
- Allow multiple teachers per cohort.
- Support a staffing model of 6 teachers per cohort: 3 Math and 3 English teachers, each responsible for 2 lessons.
- Let teachers/admins assign lessons to specific weeks, subjects, session dates, and responsible teachers.
- Let teachers set prerecorded lessons before a live session.
- Let teachers set and manage homework by cohort, subject, lesson, and due date.
- Show a clear dashboard of:
  - who watched a lesson
  - who did not watch
  - who attempted the quiz
  - who did not attempt the quiz
  - who passed the quiz
  - who submitted homework
  - who is missing homework

### Independent Learning Goals

- Let students progress through lessons sequentially.
- Lock Week 2 until Week 1 requirements are complete.
- Support self-managed progression without teacher scheduling.
- Reuse existing lessons, quiz progress, task progress, and offline playback.
- Provide a student-facing path view with locked, unlocked, in-progress, and completed states.

---

## 3. Current System Support

### Existing Cohort Support

The current system already has:

- `cohorts`: class/cohort records with name, grade level, join code, active state, and optional organisation.
- `cohort_students`: student membership with approval/active state.
- `cohort_teachers`: many teachers can be attached to a cohort, including a primary teacher flag.
- `cohort_lessons`: lessons can be assigned to a cohort.
- Cohort-based RLS for lesson access:
  - published lessons with no cohort assignments are visible to authenticated students
  - published lessons with active cohort assignments are visible only to students in those cohorts
- Teacher cohort pages under `src/app/(dashboard)/teacher/cohorts`.
- Student lessons page under `src/app/(dashboard)/lessons`.

### Existing Homework Support

The current system already has:

- `homework_assignments`: cohort-scoped homework with subject, lesson, due date, published state, total points, and creator.
- `homework_submissions`: per-student submission rows.
- `homework_questions`: assignment questions.
- A sync migration that creates missing submission rows when homework is published or students join a cohort later.
- Teacher homework API at `src/app/api/homework/route.ts`.

### Existing Progress Support

The current system already tracks:

- `lesson_progress.completed`
- `lesson_progress.completed_at`
- `lesson_progress.last_position_seconds`
- `lesson_progress.total_watch_time_seconds`
- `lesson_progress.questions_answered`
- `lesson_progress.questions_correct`
- `lesson_progress.quiz_attempts`
- `lesson_progress.quiz_passed`
- `lesson_progress.tasks_completed`
- `lesson_progress.required_tasks_completed`

This is enough to answer the core readiness question: **has this student watched the lesson and attempted the quiz?**

---

## 4. Current Gaps

### Cohort-Based Learning Gaps

The current system does not yet have:

- 12-week term metadata on cohorts.
- Week-by-week scheduling on `cohort_lessons`.
- Subject slot scheduling for English and Math inside the same cohort.
- Session dates or due dates on cohort lesson assignments.
- A `watch_before_session` requirement flag.
- Responsible teacher assignment per scheduled lesson.
- Teacher rota UI for the 6-teacher model.
- A readiness dashboard showing lesson watch, quiz attempt, and homework status per student.
- Bulk scheduling tools for copying a weekly structure across a cohort.
- Reporting exports for volunteers/teachers.

### Independent Learning Gaps

The current system does not yet have:

- Learning path/course definitions.
- Ordered lesson steps.
- Week/module grouping independent of cohorts.
- Unlock requirements.
- Student path enrollment.
- Student current step tracking.
- Student UI showing a sequential path.
- Admin/teacher UI for authoring independent paths.

---

## 5. Product Model

### Cohort-Based Learning

Use this for Amal-managed programmes where teachers actively run classes.

Core concepts:

- A cohort has a fixed start date and end date.
- A cohort has 12 scheduled weeks by default.
- Each week can contain Math and English lessons.
- Each lesson can be set as prerequisite viewing before a live session.
- Homework can be linked to the lesson, subject, cohort, and due date.
- Multiple teachers can be assigned to the cohort and optionally to specific lessons.

Example cohort:

| Week | Subject | Lesson | Teacher | Pre-watch Due | Live Session | Homework Due |
|------|---------|--------|---------|---------------|--------------|--------------|
| 1 | English | Small and capital letters | Teacher A | Monday | Tuesday | Friday |
| 1 | Math | Counting 1-10 | Teacher D | Wednesday | Thursday | Sunday |
| 2 | English | Simple sentences | Teacher B | Monday | Tuesday | Friday |
| 2 | Math | Addition basics | Teacher E | Wednesday | Thursday | Sunday |

### Independent Learning

Use this for self-serve student progression.

Core concepts:

- A learning path is an ordered sequence of lessons.
- Lessons are grouped into weeks/modules/levels.
- A student unlocks the next item after meeting completion requirements.
- Teachers are not required for progression.
- Homework is optional or replaced by auto-graded practice tasks.

Example path:

| Step | Module | Lesson | Unlock Rule |
|------|--------|--------|-------------|
| 1 | Week 1 | Alphabet basics | Available immediately |
| 2 | Week 1 | Letter matching | Complete Step 1 |
| 3 | Week 1 | Week 1 quiz | Complete Steps 1-2 |
| 4 | Week 2 | Short words | Pass Week 1 quiz |

---

## 6. Data Model Plan

### 6.1 Extend `cohorts`

Add term/programme metadata:

```sql
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS duration_weeks integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS learning_mode text NOT NULL DEFAULT 'cohort';
```

Recommended constraint:

```sql
ALTER TABLE public.cohorts
  ADD CONSTRAINT cohorts_learning_mode_check
  CHECK (learning_mode IN ('cohort', 'independent'));
```

Notes:

- `learning_mode` can start as `'cohort'` everywhere.
- If independent learning is modelled separately later, this field can still help segment dashboards.
- `duration_weeks` defaults to 12 but should not hard-code all future programmes to 12.

### 6.2 Extend `cohort_lessons`

Add scheduling fields:

```sql
ALTER TABLE public.cohort_lessons
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS week_number integer,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS release_at timestamptz,
  ADD COLUMN IF NOT EXISTS prewatch_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_at timestamptz,
  ADD COLUMN IF NOT EXISTS homework_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_before_session boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;
```

Recommended constraints/indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_cohort_lessons_schedule
  ON public.cohort_lessons(cohort_id, week_number, subject_id, sequence);

CREATE INDEX IF NOT EXISTS idx_cohort_lessons_assigned_teacher
  ON public.cohort_lessons(assigned_teacher_id);

ALTER TABLE public.cohort_lessons
  ADD CONSTRAINT cohort_lessons_week_number_check
  CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 52);
```

Recommended uniqueness for scheduled active lessons:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_lessons_active_schedule_slot
  ON public.cohort_lessons(cohort_id, week_number, subject_id, sequence)
  WHERE is_active = true AND week_number IS NOT NULL AND subject_id IS NOT NULL;
```

Important: the existing unique `(cohort_id, lesson_id)` is still useful to prevent duplicate lesson assignment to the same cohort. If a repeated lesson should be allowed in different weeks later, this unique constraint would need to be reconsidered.

### 6.3 Extend `cohort_teachers`

The DB already supports multiple teachers. Add optional subject and role metadata:

```sql
ALTER TABLE public.cohort_teachers
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
```

Recommended role values:

- `lead`
- `teacher`
- `assistant`
- `observer`

This supports the 6-teacher model without needing a new staffing table.

### 6.4 Independent Learning Tables

Create these only when implementing independent learning. Do not block cohort MVP on these tables.

```sql
CREATE TABLE public.learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar text NOT NULL,
  title_en text,
  description_ar text,
  description_en text,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_level integer NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.learning_path_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  week_number integer,
  module_title_ar text,
  module_title_en text,
  sequence integer NOT NULL,
  required_completion_percent integer NOT NULL DEFAULT 80,
  require_quiz_pass boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(path_id, sequence)
);

CREATE TABLE public.student_learning_path_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path_id uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  current_step_id uuid REFERENCES public.learning_path_steps(id) ON DELETE SET NULL,
  completed_steps integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, path_id)
);
```

---

## 7. Backend/API Plan

### 7.1 Cohort Schedule API

Add routes:

- `GET /api/teacher/cohorts/[id]/schedule`
- `POST /api/teacher/cohorts/[id]/schedule`
- `PATCH /api/teacher/cohorts/[id]/schedule/[cohortLessonId]`
- `DELETE /api/teacher/cohorts/[id]/schedule/[cohortLessonId]`

Responsibilities:

- Return scheduled lessons grouped by week and subject.
- Create/update/delete `cohort_lessons` rows.
- Validate teacher/admin access through `cohort_teachers`.
- Validate assigned teacher belongs to the same cohort.
- Validate week number is inside the cohort duration.
- Optionally create linked homework assignment if homework fields are supplied.

### 7.2 Cohort Readiness API

Add route:

- `GET /api/teacher/cohorts/[id]/readiness`

Query parameters:

- `week=1`
- `subject_id=...`
- `lesson_id=...`
- `status=missing_prewatch|missing_quiz|missing_homework|ready`

Response shape:

```ts
type CohortReadinessResponse = {
  cohort: {
    id: string
    name: string
    duration_weeks: number
  }
  schedule: Array<{
    cohort_lesson_id: string
    lesson_id: string
    lesson_title: string
    subject_id: string | null
    subject_name: string | null
    week_number: number | null
    sequence: number
    prewatch_due_at: string | null
    session_at: string | null
    assigned_teacher_id: string | null
  }>
  students: Array<{
    student_id: string
    full_name: string
    avatar_url: string | null
    lessons: Record<string, {
      watched_percent: number
      watched: boolean
      completed: boolean
      quiz_attempted: boolean
      quiz_passed: boolean
      questions_answered: number
      questions_correct: number
      homework_status: 'not_assigned' | 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'returned'
    }>
  }>
}
```

Readiness definitions:

- `watched`: `lesson_progress.completed = true` OR watched percent >= 80.
- `quiz_attempted`: `lesson_progress.questions_answered > 0` OR `quiz_attempts > 0`.
- `quiz_passed`: `lesson_progress.quiz_passed = true`.
- `homework submitted`: `homework_submissions.status IN ('submitted', 'graded', 'returned')`.
- `ready for live session`: watched and quiz attempted. If the lesson has linked homework due before session, homework must also be submitted.

### 7.3 Independent Learning API

Add later:

- `GET /api/learning-paths`
- `GET /api/learning-paths/[id]`
- `POST /api/learning-paths/[id]/enroll`
- `GET /api/learning-paths/[id]/progress`
- `POST /api/learning-paths/[id]/advance`

Unlock evaluation:

- Read path steps ordered by `sequence`.
- Join `lesson_progress` for the student.
- A step is complete when:
  - lesson progress percent meets `required_completion_percent`
  - and if required, quiz is passed
  - and if required, required tasks are completed
- The first incomplete step is the current step.
- Steps after the current step are locked.

---

## 8. Frontend Plan

### 8.1 Teacher Cohort Overview

Update:

- `src/app/(dashboard)/teacher/cohorts/page.tsx`
- `src/app/(dashboard)/teacher/cohorts/[id]/page.tsx`

Add:

- cohort start/end date
- current week indicator
- quick stats:
  - students enrolled
  - lessons scheduled this week
  - students ready for next session
  - homework missing
  - quiz attempts missing

### 8.2 Cohort Planner Tab

Add a new tab to the cohort detail page:

- `Planner`

The planner should show:

- Week 1 to Week 12 rows.
- Subject columns or cards for English and Math.
- Assigned lesson.
- Assigned teacher.
- Pre-watch due date.
- Live session date.
- Homework due date.
- Publish/release state.

Core actions:

- assign lesson to week
- remove lesson from week
- reorder lessons in a week
- set responsible teacher
- set pre-watch due date
- set session date
- link/create homework
- duplicate week pattern

### 8.3 Readiness Dashboard Tab

Add a new tab:

- `Readiness`

Views:

- Week view: all scheduled lessons for a week.
- Lesson view: one scheduled lesson, all students.
- Student view: one student across all scheduled lessons.

Columns:

- Student
- Watched
- Watch %
- Quiz attempted
- Quiz score/pass
- Homework status
- Ready/not ready
- Last updated

Filters:

- week
- subject
- lesson
- missing pre-watch
- missing quiz
- missing homework
- ready
- not ready

Bulk actions:

- copy missing pre-watch list
- export CSV
- message/remind students later if messaging is added

### 8.4 Teacher Rota UI

Add a `Teachers` tab or section on cohort details.

Show:

- teacher name
- subject
- role
- number of assigned lessons
- primary teacher flag

Actions:

- add teacher
- remove/deactivate teacher
- assign subject
- mark lead teacher
- assign lessons from planner

For the 6-teacher model:

- 3 Math teachers
- 3 English teachers
- each teacher receives 2 lessons
- show workload counts so admins can see if a teacher has too many/few lessons

### 8.5 Student Cohort View

Update student lesson list to make assigned cohort lessons clearer:

- show "This week"
- show "Watch before class"
- show due date/session date
- show locked/unavailable only if release date is in the future
- show completion requirement

Current student lessons page orders by `updated_at`. For cohort mode, it should prefer:

1. active cohort schedule order
2. week number
3. subject display order
4. sequence
5. fallback updated date

### 8.6 Independent Learning UI

Add later:

- `/learning-paths`
- `/learning-paths/[id]`

Student UI:

- path map
- module/week grouping
- locked/unlocked states
- current step CTA
- completion progress
- streak optional later

Teacher/admin UI:

- create path
- add ordered lessons
- set unlock requirements
- publish path

---

## 9. Reporting Plan

### Teacher Readiness Matrix

Primary report:

| Student | Week | Subject | Lesson | Watched | Quiz Attempted | Quiz Passed | Homework | Ready |
|---------|------|---------|--------|---------|----------------|-------------|----------|-------|

This report should be generated from:

- `cohort_students`
- `cohort_lessons`
- `lessons`
- `subjects`
- `lesson_progress`
- `homework_assignments`
- `homework_submissions`

### Aggregate Cohort Summary

Show:

- total students
- percentage watched
- percentage quiz attempted
- percentage quiz passed
- percentage homework submitted
- students not ready

### Export

Add CSV export from readiness tab.

Initial CSV fields:

- cohort name
- week number
- subject
- lesson title
- student name
- watched percent
- completed
- quiz attempted
- quiz passed
- questions answered
- questions correct
- homework status
- ready
- last progress update

---

## 10. Permissions and RLS

### Cohort Schedule

Teachers can manage schedule rows if:

- they are in `cohort_teachers` for that cohort
- or they are admin

Students can view schedule rows if:

- they are active approved students in the cohort

### Readiness Dashboard

Teachers can view student readiness if:

- they are in `cohort_teachers` for the cohort
- or they are admin

Students should not be able to view other students' readiness.

### Independent Paths

Students can view published paths.

Students can only view and update their own path progress.

Teachers/admins can create/update paths.

---

## 11. Implementation Phases

### Phase 0: Confirm Production DB State

Goal: avoid implementing against stale or unapplied migrations.

Tasks:

- Confirm all local migrations are applied in Supabase.
- Confirm `cohort_lessons` exists in production.
- Confirm `lesson_progress` contains reliable data for watched/quiz status.
- Confirm homework submission sync migration is applied.
- Confirm RLS allows teachers to read readiness data for their cohorts.

Exit criteria:

- Production DB schema matches expected local migrations.
- A sample cohort can return students, assigned lessons, progress, and homework submissions.

### Phase 1: Cohort Readiness MVP

Goal: answer the immediate operational question: who watched and who attempted the quiz?

Tasks:

- Add readiness query/API.
- Add `Readiness` tab on cohort details.
- Show one row per student per assigned lesson.
- Show watched/not watched.
- Show quiz attempted/not attempted.
- Show quiz passed/not passed.
- Show homework status where linked.
- Add CSV export.

Acceptance criteria:

- A teacher can open a cohort and immediately see who is ready for a lesson.
- A teacher can filter to students who have not watched.
- A teacher can filter to students who have not attempted the quiz.
- A teacher can export the list.
- Data matches `lesson_progress` and `homework_submissions`.

Estimated workload: 2-4 days.

### Phase 2: 12-Week Cohort Planner

Goal: make lesson scheduling explicit instead of a flat list of assigned lessons.

Tasks:

- Add migration for cohort term fields.
- Add migration for `cohort_lessons` schedule fields.
- Update generated database types.
- Add planner tab.
- Support week number, subject, sequence, teacher, prewatch due date, session date, and homework due date.
- Update student lesson ordering to use cohort schedule.
- Add release/date handling.

Acceptance criteria:

- A teacher can create a 12-week plan.
- A teacher can assign English and Math lessons to each week.
- A teacher can set a lesson as "watch before class".
- Students see scheduled lessons in the correct order.
- Lessons scheduled for future release dates do not appear early unless intentionally configured.

Estimated workload: 4-7 days.

### Phase 3: Multi-Teacher Rota

Goal: support multiple teachers per cohort and the 6-teacher staffing model.

Tasks:

- Add subject/role metadata to `cohort_teachers`.
- Add teacher management UI.
- Add teacher assignment to planner rows.
- Show lesson load counts per teacher.
- Add validation that assigned lesson teacher belongs to the cohort.

Acceptance criteria:

- Admin/lead teacher can add 6 teachers to a cohort.
- Teachers can be labelled Math or English.
- Each teacher can be assigned 2 lessons.
- Planner shows teacher assignment.
- Readiness dashboard can filter by assigned teacher.

Estimated workload: 2-4 days.

### Phase 4: Homework Integration

Goal: connect scheduled lessons and homework more tightly.

Tasks:

- Link homework assignments to scheduled cohort lessons where possible.
- Add "create homework from planner row".
- Show homework status inside readiness dashboard.
- Add missing homework filter.
- Ensure late-added students receive homework submission rows.

Acceptance criteria:

- A teacher can set homework for a scheduled lesson.
- Homework appears in readiness status.
- Missing homework is visible by student and by lesson.
- Existing homework sync still works.

Estimated workload: 2-4 days.

### Phase 5: Independent Learning MVP

Goal: support self-managed sequential learning.

Tasks:

- Add `learning_paths`, `learning_path_steps`, and `student_learning_path_progress`.
- Add RLS policies.
- Add teacher/admin path authoring.
- Add student path UI.
- Add unlock evaluator.
- Add "complete step" and "advance" logic.
- Reuse `lesson_progress` for completion and quiz pass.

Acceptance criteria:

- Student can enroll in a published path.
- Student can only access unlocked steps through the path UI.
- Week 2 remains locked until Week 1 requirements are complete.
- Student progress persists.
- Teachers/admins can publish and edit paths.

Estimated workload: 1-2 weeks for MVP.

### Phase 6: Polish and Automation

Goal: make the system operationally useful at scale.

Tasks:

- Automated reminders for missing pre-watch/homework.
- Cohort templates.
- Duplicate schedule from previous cohort.
- Bulk import students and teachers.
- Attendance tracking for live sessions.
- Parent/guardian progress summaries if needed.
- Offline path download support for independent learning.

Estimated workload: 2-4 weeks depending on scope.

---

## 12. Testing Plan

### Unit Tests

Add tests for:

- readiness status calculation
- watched percent calculation
- quiz attempted calculation
- ready/not ready calculation
- independent unlock evaluator
- schedule validation

### Integration Tests

Add tests for:

- teacher can create/update schedule row
- student can view assigned cohort schedule
- unrelated student cannot view restricted cohort lesson
- teacher can fetch readiness for own cohort
- teacher cannot fetch readiness for unrelated cohort
- homework status appears in readiness response

### Manual QA

Test scenarios:

1. Create a cohort with start/end dates.
2. Add students.
3. Add 6 teachers.
4. Assign English and Math lessons across 12 weeks.
5. Mark a lesson as watch-before-session.
6. Log in as student and watch 80% of lesson.
7. Attempt quiz.
8. Submit homework.
9. Log in as teacher and confirm readiness updates.
10. Export readiness CSV.
11. Confirm future released lessons do not show early.
12. Confirm a student outside the cohort cannot access restricted lessons.

### Production Verification

Before rollout:

- Run `npm run build`.
- Run typecheck if available.
- Run targeted unit tests.
- Test one real teacher account.
- Test one real student account.
- Validate Supabase RLS in production.
- Confirm CSV export contains correct data.

---

## 13. Rollout Plan

### Step 1: Internal Admin/Test Cohort

- Create one test cohort.
- Add test teachers and test students.
- Schedule 2 weeks only.
- Verify readiness reporting.

### Step 2: Pilot Real Cohort

- Use one real class.
- Schedule English and Math for 2-3 weeks.
- Ask teachers to use readiness report before live sessions.
- Collect feedback on missing columns or confusing statuses.

### Step 3: Full 12-Week Cohort Rollout

- Create final 12-week schedule.
- Assign teachers.
- Publish schedule.
- Track readiness weekly.
- Export weekly reports.

### Step 4: Independent Learning Pilot

- Choose one subject and grade.
- Create a short 2-week path.
- Test unlock logic.
- Add offline download support if needed.

---

## 14. Operational Workflow

### Weekly Cohort Workflow

1. Amal Teachers schedule the week's prerecorded lessons.
2. Students watch lessons before the live session.
3. Students attempt embedded quiz/questions.
4. Teachers open readiness dashboard before the session.
5. Live session focuses on practice and support.
6. Teachers set homework.
7. Teachers review homework submissions.
8. Cohort lead reviews weekly completion report.

### Teacher Staffing Workflow

1. Cohort lead creates cohort.
2. Cohort lead adds 3 English teachers and 3 Math teachers.
3. Planner assigns two lessons per teacher.
4. Teachers can view the cohort and their assigned lessons.
5. Cohort lead monitors workload balance.

---

## 15. Risks and Mitigations

### Risk: Progress Data Is Incomplete

If students watch offline or close tabs before progress syncs, readiness may undercount watching.

Mitigation:

- Keep existing offline progress sync working.
- Show `last updated`.
- Treat manual "mark complete" as valid completion.
- Add sync retry visibility later.

### Risk: Schedule Fields Conflict With Existing Flat Assignments

Existing `cohort_lessons` rows have no week number.

Mitigation:

- Make schedule fields nullable.
- Existing assignments remain valid.
- Planner shows unscheduled lessons separately.

### Risk: Teacher Access Becomes Too Broad

Multiple teachers per cohort means more people can see student progress.

Mitigation:

- Keep access scoped to `cohort_teachers`.
- Add admin-only controls for adding teachers if needed.
- Audit teacher membership changes later.

### Risk: Independent Learning and Cohort Learning Conflict

The same lesson may be used in a cohort schedule and an independent path.

Mitigation:

- Keep scheduling/path membership separate from the lesson itself.
- Lesson progress remains per student/lesson.
- Cohort readiness reads cohort schedule.
- Independent unlock reads path steps.

### Risk: 12 Weeks Is Too Rigid

Future programmes may be 4, 8, or 16 weeks.

Mitigation:

- Store `duration_weeks`.
- Default to 12 but allow other values.

---

## 16. Open Decisions

These should be decided before implementation:

- Should only admins manage teacher rosters, or can lead teachers add teachers?
- Should a student be able to belong to multiple active cohorts?
- Should a lesson be reusable multiple times in the same cohort across different weeks?
- Should "watched" mean 80%, 90%, full completion, or manual completion?
- Should quiz pass be required for readiness, or is an attempt enough?
- Should homework be required before live session or after live session?
- Should independent learning use the same public lesson list, or hide the old list behind paths?

Recommended defaults:

- Lead teachers and admins can manage teacher rosters.
- Students can belong to multiple cohorts, but the UI should separate them.
- Do not allow duplicate lesson assignment to the same cohort until there is a clear need.
- Watched means 80% or completed.
- Readiness requires watched + quiz attempted; quiz pass is shown but not required by default.
- Homework is due after live session by default.
- Independent learning should have a separate path UI.

---

## 17. Immediate Next Build Tasks

1. Create migration for cohort term and schedule fields.
2. Generate/update Supabase TypeScript types.
3. Implement readiness status helper.
4. Add `GET /api/teacher/cohorts/[id]/readiness`.
5. Add `Readiness` tab to cohort details page.
6. Add CSV export.
7. Add `Planner` tab with basic week/subject schedule.
8. Update student lesson ordering for scheduled cohort lessons.
9. Add teacher rota fields and UI.
10. Pilot with one real cohort before building independent mode.

---

## 18. Success Metrics

### Cohort Mode

- Teachers can identify missing pre-watch students in under 30 seconds.
- Teachers can see quiz attempt status before each live session.
- Teachers can export weekly readiness.
- At least one 12-week cohort can run without external spreadsheets.
- Homework missing/submitted status is visible from the same cohort page.

### Independent Mode

- Students understand the next required lesson without teacher guidance.
- Locked lessons stay locked until requirements are met.
- Students can resume progress across devices.
- Teachers/admins can create paths without developer intervention.

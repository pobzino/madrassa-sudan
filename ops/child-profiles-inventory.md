# Child Profiles Workflow: Code Inventory

This inventory is for the child profiles implementation. It is based on the current repository at the time of the workflow and the partial shared learner contract in `.claude/worktrees/wf_1f1e25bc-736-3/src/lib/learners/types.ts`. That file is prior work in a workflow worktree, not yet integrated into `src/`.

## Existing contracts and entry points

| Area | Files | Current behavior / impact |
| --- | --- | --- |
| Learner contract (partial prior work) | `.claude/worktrees/wf_1f1e25bc-736-3/src/lib/learners/types.ts` | Defines `x-amal-learner`, `Learner`, 12 animal avatar IDs and English/Arabic labels, grade bounds, `GET /api/learners` response, and name/age helpers. It has `MAX_LEARNERS_PER_ACCOUNT = 8`; reconcile this against the signup schema's 1–8 children before importing. |
| Profile schema and signup trigger | `supabase/migrations/20260101000000_base_schema.sql`; `supabase/migrations/20260826100000_launch_readiness_auth_hardening.sql` | `profiles.id` currently references `auth.users(id)`; `handle_new_user()` creates the profile and persists parent application intake (including children ages). Any child profile model must deliberately support a profile without an auth user while preserving all current profile IDs. |
| Parent signup API | `src/app/api/auth/parent-signup/route.ts` | Validates parent intake with `children_count` 1–8 and `children_ages` 1–8 (ages 3–19); creates an auth user with `signup_details`. Parent signup currently uses a synthetic WhatsApp-derived email. |
| Database generated types | `src/lib/database.types.ts` | Generated schema contract; update alongside migration, including profile columns, new profile relationship, and any learner helper functions. |
| Offline storage identity and cache keys | `src/lib/offline/{cache-names,db,identity}.ts`; `src/sw/service-worker.template.js` | IndexedDB `amal-offline` v2 stores lessons, progress queue, downloads, metadata, and responses. `ownerId` is currently family/auth account identity. Private localStorage keys/prefixes and service-worker cache names are mirrored and must be migrated/cleared consistently. |
| Offline lesson progress and answers | `src/lib/offline/{sync,slide-responses}.ts`; lesson player/offline player pages | Progress and slide answers are queued for sync and keyed by account plus lesson/slide. They must acquire a learner dimension. Lesson media/content downloads are family-shared. |
| Lesson progress and responses APIs | `src/app/api/lesson-progress/route.ts`; `src/app/api/lessons/[id]/{responses,slide-responses,task-responses}/route.ts` | Student ID is currently the signed-in profile. These routes need one shared authenticated learner resolver; body/query-supplied student IDs are not authority. |
| Diagnostic APIs | `src/app/api/diagnostic/{start,submit,complete,results}/route.ts` | Attempts and placements are student-scoped. Starting or reading a diagnostic must use the active learner context. |
| Practice and score gates | `src/app/api/homework/**`; `src/app/api/lesson-progress/**`; `supabase/migrations/20260726100000_applications_and_practice.sql`; `supabase/migrations/20261016120000_lock_down_student_grading_writes.sql` | `homework_attempts.student_id` and progress identify the student. Practice gates are server/database enforced and must evaluate the selected learner's attempt only. Never accept a client-set score or pass flag. |
| Dashboard and learner-facing screens | `src/app/(dashboard)/layout.tsx`; `src/app/(dashboard)/dashboard/page.tsx`; `src/app/(dashboard)/practice/**`; `src/app/(dashboard)/settings/**`; `src/app/(dashboard)/lessons/**` | Dashboard, lessons, practice, and settings currently assume the signed-in profile is the learner. Parent view has existing guardian/student links in `src/app/(dashboard)/guardian/**`; don't weaken those relationships. |
| Weekly email and push automation | `src/lib/server/email-automations.ts`; `src/lib/server/push-automations.ts`; `src/app/api/internal/emails/weekly-progress/route.ts`; `src/app/api/internal/push/streak-reminders/route.ts`; Netlify function callers under `netlify/functions/` | Weekly progress currently groups data directly on parent `id`; streak reminders target parent profile IDs. Child activity needs family aggregation with child attribution, while preserving opt-in, idempotency, delivery, and privacy rules. Parent signup's synthetic email is not a deliverable email address. |
| Existing localized UI patterns | `src/app/(dashboard)/settings/**`; `src/lib/translations.ts` (and existing page-local dictionaries) | Reuse the existing English/Arabic language choice and RTL behavior. The spec below pins copy for new child-management screens. |

## Related learning data tables

The existing tables store a learner's identity in `student_id` (FK to `profiles.id`): `lesson_progress`, `lesson_question_responses`, `lesson_slide_responses`, `lesson_task_responses`, `homework_submissions`, `homework_attempts`, `diagnostic_attempts`, `student_placements`, and `student_streaks`. Other learner activity tables may have the same shape; review all `student_id` foreign keys before finalizing migration/RLS.

## Workflow notes

- There is no existing saved child-profiles inventory in `ops/`; this file supplies it.
- `ops/current-spec.md` is for the unrelated MS-007 quiz task; do not replace it.
- The repo root `AGENTS.md` requires reading the relevant installed Next.js guide before writing framework-specific code. This inventory/spec makes no Next.js API recommendations; builders must read the relevant guide before implementation.

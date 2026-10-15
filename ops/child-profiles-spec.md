# Child Profiles: Shared Architecture Spec

Status: builder contract, 2026-10-16. Read this before implementing any child-profile slice. `ops/child-profiles-inventory.md` records the current code touchpoints.

## 1. Product and identity model

A parent signs in as the family account. The signed-in parent's existing `profiles.id` remains the account ID and is also a valid learner ID for the parent's own progress (the “self” learner). Child learners are separate `profiles` rows with no `auth.users` record and no independent credentials. Every learning record continues to use its existing `student_id`; the value is the selected learner profile ID.

A parent account may own up to **8 child profiles**, in addition to its self learner. This matches parent signup's child count bounds. Rename the partial constant `MAX_LEARNERS_PER_ACCOUNT` to `MAX_CHILD_PROFILES_PER_ACCOUNT` (value 8); do not enforce the partial constant as 8 total learners. Reject the ninth child atomically with HTTP 409 and a bilingual user-facing error.

Only accounts with `profiles.role = 'parent'` can own child profiles. `teacher`, `admin`, student, and legacy accounts cannot create or switch to another learner. Teachers' existing student access continues through cohort/assignment policies and is not changed by this feature.

## 2. Database and migration contract

Add one forward-only Supabase migration. Preserve every existing profile's UUID, auth relationship, role, and progress references.

### `profiles`

- Keep `id UUID PRIMARY KEY`; preserve existing IDs exactly.
- Replace the hard `id -> auth.users(id)` dependency with `auth_user_id UUID UNIQUE NULL REFERENCES auth.users(id) ON DELETE CASCADE`; backfill `auth_user_id = id` for all existing rows. Authenticated account/self rows retain `id = auth_user_id` for compatibility. Child rows have a generated UUID and `auth_user_id IS NULL`.
- Add `parent_account_id UUID NULL REFERENCES profiles(id) ON DELETE CASCADE`; null means ordinary account/self/teacher profile, non-null means a child owned by that parent profile. A constraint/trigger ensures the owner row has `role = 'parent'` and is itself not a child. Children are `role='student'` and cannot own children.
- Add `learner_name TEXT NULL` (trimmed, 1–60 chars when present) and `learner_avatar TEXT NULL` constrained to exactly: `cat`, `dog`, `lion`, `elephant`, `camel`, `rabbit`, `turtle`, `fish`, `bird`, `monkey`, `bear`, `frog`.
- Existing `full_name TEXT NOT NULL` remains populated for every row. Child creation sets it to the learner name (or a neutral setup placeholder until named); the UI displays `learner_name`, falling back to `full_name` only for legacy self rows.
- Add `archived_at TIMESTAMPTZ NULL` only if removal needs a reversible state. The API contract below uses hard removal with dependent child learning rows deleted by their existing profile FKs; do not silently archive a child while presenting deletion as complete.
- Add an index on `parent_account_id`; enforce at most 8 non-archived child rows per parent with a concurrency-safe trigger/transaction, not a client-only count.

The migration must inspect every FK to `profiles.id` and retain `ON DELETE CASCADE` semantics for child's learning records. Do not cascade a child delete to the parent. Auth-user cascade continues through `auth_user_id` and must remove that account's parent-owned child rows. Preserve and test profile-delete behavior explicitly.

### Signup

The existing auth trigger remains responsible for creating the parent's account profile and persisting the signup application. Parent signup data has children ages but no child names. It must create a pending child learner row per valid signup age (up to 8), with a generated UUID, owner ID, calculated grade `clamp(round(age) - 5, 1, 12)`, no avatar, and `learner_name = NULL`; do not invent a child's name. Each pending row is returned by the learners API and completed by the first-run naming flow. Make trigger creation idempotent and ensure malformed/missing ages never prevent auth account creation. If signup's `children_count` exceeds the number of valid ages, create only the valid ages and let the parent add the remainder.

For older parent accounts with no children rows, return `suggestedChildren` from the persisted parent intake so the first-run flow can create them. Do not create duplicates: persist/mark intake consumption atomically with row creation. `GET /api/learners` returns `accountId`, `canHaveChildren`, `needsSelfName`, `selfSuggestedAge`, `learners` (self first, children oldest-added first), and remaining `suggestedChildren` with `name` and `age`. `canHaveChildren` is true only for a parent account below the child limit.

## 3. Request contract and server child context

The shared header is exactly `x-amal-learner` (constant `LEARNER_HEADER`). Its value is the UUID of the active `profiles` learner. It selects the learner only; it is never authentication or authorization.

Resolution rules for every student-facing API and server data loader:

1. Authenticate the request using the existing session.
2. With no header, use `auth.uid()`'s profile as learner (preserves all existing callers).
3. With a header equal to `auth.uid()`, use the account/self profile.
4. With a different UUID, allow only if the authenticated profile has `role='parent'` and the target profile has `parent_account_id = auth.uid()`, `role='student'`, `auth_user_id IS NULL`, and is not deleted/archived.
5. Malformed, unknown, foreign-family, or unauthorized learner IDs return 400 for invalid syntax and 403 for a valid but unauthorized ID; never silently fall back to self.
6. Staff/teacher endpoints retain their current cohort/role checks. A learner header cannot widen staff access.

Implement a single server-only `resolveLearnerContext(request)` (or equivalent) returning `{ accountId, learnerId, learnerProfile, isSelf }`; use it in APIs, page loaders, and server-side Supabase calls. Client-supplied `student_id`, `user_id`, scores, `quiz_passed`, or child owner IDs never override the resolved context. Every elevated/service-role query must include both the resolved `learnerId` and verified `accountId` ownership condition where applicable.

All browser fetches for learner-scoped data send the active learner header. Switching learner updates one central context and invalidates/refetches all learner-specific cached queries before rendering new progress. On failure to resolve context, show an error; do not show the previous learner's data.

## 4. RLS and security boundary

Add stable `SECURITY DEFINER` ownership predicates with a fixed safe `search_path`, e.g. `owns_learner(p_learner_id uuid)` and `can_access_learner(p_learner_id uuid)`. Revoke public/anon execution and grant only the required authenticated/service role access. The predicate resolves `auth.uid()` to a parent account and returns true only for its own profile or a direct child profile. A header never changes `auth.uid()` inside Postgres.

Update student-owned table policies so a parent session can read/write the directly owned learner's rows under existing action constraints. Child writes must still be constrained to that learner's own `student_id`; all grade/score/pass fields remain server/database-derived and immutable to untrusted clients. Preserve teacher/guardian policies as separate pathways. No policy may grant access because the caller merely knows a child UUID.

Profile policies: a parent can read/update their own profile and read/update only limited learner fields for directly owned children; child insert/delete is through the validated API/RPC, not arbitrary profile table writes. Parents may not set child role, `auth_user_id`, `parent_account_id`, approval flags, score fields, or permissions. A parent cannot read, update, delete, or infer another family's child/progress. Do not grant authenticated access to `auth.users` metadata to implement this.

Apply ownership checks to lesson progress, quiz responses, slide/task responses, diagnostics/placements, homework attempts/submissions, streaks, and any table with a student/profile FK. Practice gate functions and database triggers must use the record's `student_id`/resolved learner. An attempt by child A cannot unlock child B's practice/lesson, even within one family. Keep shared course/lesson content and family-downloaded lesson assets unchanged.

## 5. Learner API

- `GET /api/learners`: response shape described in §2. Always returns self first, then active child rows sorted by `created_at ASC, id ASC`; parent-only fields are omitted for non-parent roles. Pending rows with no name are marked `needsSetup`.
- `POST /api/learners`: parent only. Accept `{ name, age?, avatar? }`; name trim 1–60; age integer 3–19 if supplied; avatar must be in the fixed allowlist. Derive `grade_level` from age using the helper, never trust a client-supplied grade. Atomically enforce max children, create a child profile, and return its learner. Existing pending signup rows may be completed rather than duplicated.
- `PATCH /api/learners/[id]`: parent only for a direct child; allow only name, avatar, and grade/age selection according to validated fields. If the child is pending, set required name before marking setup complete. Self profile can change learner display name/avatar but cannot change role/ownership.
- `DELETE /api/learners/[id]`: parent only for a direct child; no self delete. Delete profile and cascade child-owned progress/responses/attempts/streaks. Require UI confirmation naming that learning data is deleted. Repeated delete returns 404.

Return field validation errors in a stable machine-readable form (`error` code plus field issues); user-facing copy stays English/Arabic via UI translations.

## 6. Offline storage and migration

The family account remains the owner of downloaded course content. Learning state must be partitioned by learner. Upgrade IndexedDB `amal-offline` from v2 to v3 using the existing `openDatabase` upgrade path in `src/lib/offline/db.ts`; do not delete downloaded lessons or media.

Exact key contract:

- Downloaded lesson records and download-state keys stay family/lesson scoped: `ownerId = accountId`, keyed by `lessonId`. Lessons, audio, images, and static content are shared among family learners.
- Local progress key: `${accountId}:${learnerId}:${lessonId}`.
- Local saved-response key: `${accountId}:${learnerId}:${lessonId}`; record includes both `ownerId` (family account) and `learnerId`.
- Queue item includes `ownerId = accountId` and required `learnerId`; queue deduplication/identity includes account + learner + lesson + item kind (plus slide ID for answer items). Every sync POST carries `x-amal-learner: learnerId` and is authenticated as `ownerId`.
- The active learner setting is private local state under `amal-active-learner:<accountId>`; validate it against fresh `/api/learners` on each online authenticated session. Invalid/stale/foreign values reset to self. On logout remove active-learner localStorage entries alongside current private keys.

V2-to-v3 migration must be lossless: assign all old local progress, saved answers, and queued student writes `learnerId = ownerId` (legacy self learner); retain owner, lesson assets, timestamps, and answer ordering. V2 work must not be silently reassigned to a child. Preserve existing offline conflict rules, retry behavior, server grading authority, and logout/account-switch isolation. Unsent queued work stays bound to both identities and may sync only when that family signs back in and the referenced learner is still owned; deleted child queue entries are dropped and the user is told sync could not complete. Do not merge one learner's answer/progress into another learner's view.

Online and offline player read/write adapters must take learner context explicitly. If offline and no validated learner selection has been saved, default to account/self. Switching learner while offline is allowed only to a learner previously validated and cached on this device; otherwise explain that the family needs to connect once before using that learner offline.

## 7. Screens and exact copy

Use the active UI language, existing AR/EN dictionary pattern, and Arabic RTL direction. The learner picker is shown for parent accounts after login and whenever the user selects the switcher. First-run blocks learner-scoped dashboard requests until a learner is selected or setup completed. Non-parent screens have no new picker.

| English | Arabic |
| --- | --- |
| Who’s learning? | من سيتعلّم الآن؟ |
| Choose your profile | اختر ملفك الشخصي |
| Add a child | أضف طفلًا |
| Add another child | أضف طفلًا آخر |
| My children | أطفالي |
| Switch learner | تبديل المتعلّم |
| Name your learner | اكتب اسم المتعلّم |
| Learner’s name | اسم المتعلّم |
| Choose an avatar | اختر صورة رمزية |
| Save | حفظ |
| Cancel | إلغاء |
| Edit | تعديل |
| Delete child | حذف الطفل |
| Delete {name} and their learning data? | هل تريد حذف {name} وبيانات تعلّمه؟ |
| This cannot be undone. | لا يمكن التراجع عن هذا الإجراء. |
| You can add up to 8 children. | يمكنك إضافة ٨ أطفال كحد أقصى. |
| Connect to the internet once to use this learner offline. | اتصل بالإنترنت مرة واحدة لاستخدام ملف المتعلّم دون اتصال. |
| Couldn’t load learners. Try again. | تعذّر تحميل ملفات المتعلّمين. حاول مرة أخرى. |

Screen behavior:
- **Picker:** self profile tile first, children next; show name, chosen animal avatar, and grade when known. Pending/no-name rows use “Name your learner” and cannot enter progress screens. Add tile shown only to parent accounts below limit.
- **Add/edit:** name required; age is optional when grade is already set; selecting age derives grade. Avatar optional. Validate consistently on client and server.
- **Switcher:** available in dashboard header; selection takes effect before a learner-scoped page is shown. Clear React/query caches tied to previous learner.
- **Settings → My children:** list children with add/edit/delete controls; self profile is not deletable and is managed as the account learner. Include loading, empty, max-count, and error states.
- All progress surfaces (dashboard cards, lesson list progress, practice, streak, diagnostic, and any homework learner view) are explicitly for the active learner and carry the learner header.

## 8. Progress, practice, diagnostic, and notifications

Each child has independent lesson progress, responses, diagnostic attempts/placement, homework/practice attempts, scores, and streaks under its distinct profile ID. A new child starts empty. Never copy parent's progress into a child or share progress across siblings. Existing accounts without child profiles continue to see their exact existing progress through omitted-header self behavior.

Practice gates are per learner: pass state is computed from the resolved learner's own `homework_attempts` against the practice assignment's server-controlled passing score. A sibling or parent's pass is irrelevant. Lesson completion, points, streak triggers, and “continue” gates are based on the same `student_id` learner.

Weekly notifications are delivered to the parent account, not to child profiles. Aggregate the eligible week's activity across owned learners into one family message, with per-child sections/names so guardians can tell who did what; don't expose unrelated student data. Existing non-parent summaries retain current shape and IDs. Child attempts/streaks must be grouped through `parent_account_id`; do not assume `student_id = parent.id` captures family activity. Honor email opt-in and push subscription/idempotency exactly as today. Parent signup synthetic WhatsApp email is not a real email destination; email delivery remains skipped until a deliverable address exists and is consented. Push reminder is at most one per family per scheduled day; if multiple children qualify, use one family-level message (with child name(s) or a generic family message) and one idempotency claim keyed to parent ID, never duplicate pushes per child.

## 9. Compatibility, rollout, and acceptance invariants

- Deploy additive schema/RLS first; deploy app/server code second. Until the app deploys, omitted header resolves to the same existing auth profile and old IndexedDB records mean self learner.
- Backfill `auth_user_id=id`; preserve profile and student IDs for all existing users, so URLs, foreign keys, and progress remain stable.
- Unmodified clients continue to act as self. Unknown learner header fails closed. No route depends on a new client request to avoid breaking old requests.
- Keep global lesson/download content shared and unchanged. Do not rewrite existing response/progress rows during learner onboarding.
- Tests to be owned by builders/review: parent can access own and child only; foreign parent denied even with UUID; student/teacher cannot switch; children cannot auth; max-count concurrency; child CRUD field allowlist; omitted header and `header=self` equivalence; practice pass isolated by learner; no client score/pass injection; all learner activity tables isolated; legacy offline v2 queue maps to self and syncs; sibling offline progress/answers never cross; signup missing/invalid ages; email/push family aggregation and consent/deduplication.

## 10. Shared names from the prior learner contract

Reuse the exact avatar enum and labels in `.claude/worktrees/wf_1f1e25bc-736-3/src/lib/learners/types.ts`. Shared API/UI types should retain `Learner { id, name, avatar, gradeLevel, isSelf }`, `SuggestedChild { name, age }`, `LearnersResponse`, `LEARNER_HEADER = 'x-amal-learner'`, `MIN_GRADE = 1`, and `MAX_GRADE = 12`; amend only the max-count constant as specified in §1. Do not fork per-builder spellings for header, avatar IDs, or response keys.

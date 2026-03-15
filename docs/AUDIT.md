# Madrassa Sudan — Feature Audit

_Generated: 2026-03-15_

## Critical Issues (Blocking Features)

### 1. No Video Upload Flow
Teachers must manually host videos externally and paste 3 separate URLs (360p/480p/720p). There's no upload interface, no transcoding, no progress indicator.
- **Files:** `src/app/(dashboard)/teacher/lessons/new/page.tsx`

### 2. Lesson Editor Incomplete
Loads questions and content blocks but save/update, question management, content block editing, and quiz settings UI appear half-built.
- **Files:** `src/app/(dashboard)/teacher/lessons/[id]/page.tsx`

### 3. Homework Grading UI Missing
Loads submissions but the actual grading interface (rubric evaluation, score input, feedback) isn't fully wired up.
- **Files:** `src/app/(dashboard)/teacher/homework/page.tsx`

### 4. Diagnostic Question Display Missing
API routes and results display exist, but the question-taking flow needs verification.
- **Files:** `src/app/(dashboard)/diagnostic/[subjectId]/page.tsx`

---

## High Priority

### 5. AI Tutor — No Conversation Limits
Conversations grow indefinitely with no message cap, token budget, or cleanup. Cost and memory risk.
- **Files:** `src/app/api/tutor/route.ts`

### 6. AI Tutor — Generic Error Messages
Returns "Tutor AI is not configured yet" for all config failures. Should distinguish missing API key vs other issues.
- **Files:** `src/app/api/tutor/route.ts:146`

### 7. Video Player — No Adaptive Quality
Sets quality based on available URLs but has no bandwidth detection, adaptive switching, or user preference persistence.
- **Files:** `src/app/(dashboard)/lessons/[id]/page.tsx`

### 8. Late Submission Policy Missing
`due_at` field exists on homework but no late penalties, extensions, or reminders implemented.
- **Files:** `src/app/api/homework/route.ts`

### 9. Post-Publish Enrollment Gap
When homework is published, submissions are created for current cohort students. Students who enroll later get no submission record.
- **Files:** `src/app/api/homework/route.ts`

---

## Medium Priority

### 10. No Password Reset
Login page has no "forgot password" link.
- **Files:** `src/app/auth/login/page.tsx`

### 11. Hardcoded Redirect URL
Falls back to `madrassasudan.netlify.app` — breaks for other deployments.
- **Files:** `src/app/auth/login/page.tsx:34-40`

### 12. Subject Icon Mapping Hardcoded
Dashboard maps subject names via `name.includes("math")` instead of using the `icon` field from DB.
- **Files:** `src/app/(dashboard)/dashboard/page.tsx`

### 13. Guardian Portal Incomplete
Tables and RLS exist, but dashboard/student view pages need verification of actual content.
- **Files:** `src/app/(dashboard)/guardian/`

### 14. No Error Boundaries
No React error boundaries for crashed components — failed video player, bad API response, or auth expiration crashes the page.

### 15. Missing Auto-Save on Lesson/Homework Creation
Teachers filling out complex forms risk data loss on refresh.

---

## Low Priority

### 16. No Loading Skeletons
Generic spinners everywhere instead of content-aware skeletons.

### 17. API Error Responses Undifferentiated
Don't distinguish validation vs auth vs DB failures.

### 18. No Plagiarism Detection or Peer Review
Homework system has no plagiarism detection or peer review workflow.

### 19. Diagnostic Results Don't Feed AI Tutor
Placement data not integrated into AI tutor recommendations or learning paths.

---

## Build Fixes Applied (2026-03-15)

During the E2E testing pass, the following build-breaking issues were fixed:

1. **Next.js 16 `params` must be `Promise`** — Updated 7 API route handlers and 1 page component to use `await params` / `React.use()`:
   - `src/app/api/teacher/lessons/[id]/route.ts` (GET, PATCH)
   - `src/app/api/teacher/lessons/[id]/questions/route.ts` (GET, POST, PATCH, DELETE, PUT)
   - `src/app/(dashboard)/guardian/students/[id]/page.tsx`

2. **Wrong column name `teacher_id` → `created_by`** — Fixed in 2 files:
   - `src/app/api/teacher/lessons/[id]/questions/[questionId]/route.ts`
   - `src/app/api/teacher/lessons/content/route.ts`

3. **OpenAI SDK requires `strict` field on function tools** — Added `strict: false` to tool mapping in:
   - `src/app/api/tutor/route.ts`

4. **Missing `@/components/ui/*` (shadcn/ui) and `lucide-react`** — Created minimal UI components and replaced icons with inline SVGs:
   - Created: `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx`
   - Updated: `src/components/lessons/QuizOverlay.tsx`, `src/components/teacher/QuestionList.tsx`

5. **Missing type export `QuestionData`** — Defined inline in `src/components/teacher/QuestionList.tsx`

6. **Unsafe type cast in `student-tools.ts`** — Fixed via `unknown` intermediate cast

---

## E2E Test Results (2026-03-15)

Tested locally on `http://localhost:3000` with a teacher-role account.

| Page | Status | Notes |
|------|--------|-------|
| Landing `/` | OK | Loads, nav works, subjects shown |
| Student Dashboard `/dashboard` | OK | Stats, achievements, subject cards render |
| Lessons `/lessons` | OK | Search, filters, empty state |
| Homework `/homework` | OK | Tabs (All/Pending/Submitted/Graded), subject filter |
| Assessment `/diagnostic` | OK | All 8 subjects with Start Assessment buttons |
| AI Tutor `/tutor` | OK | Chat UI, history sidebar, quick prompts, speech toggle |
| Progress `/progress` | OK | Overview stats, weekly chart, parent summary, by-subject |
| Teacher Dashboard `/teacher` | OK | Stats cards, quick actions, recent activity |
| Create Lesson `/teacher/lessons/new` | OK | Bilingual form, all 8 subjects in dropdown, grades 1-12 |
| Create Assignment `/teacher/homework/create` | OK | Class/subject selectors, 5 question types |
| Guardian Portal `/guardian/dashboard` | OK | Link a Student CTA, empty state |
| Settings `/settings` | OK | Profile editing, role badge, language preference |
| Auth redirect `/auth/login` | OK | Redirects to dashboard when already logged in |

**Console errors:** Only "Error loading students" on guardian page (expected — test user is not a guardian role). No crashes or unhandled exceptions.

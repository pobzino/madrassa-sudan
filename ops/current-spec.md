# MS-007: Enhanced In-Lesson Quizzes (RETRY — Score 1)

## Task ID
MS-007

## ⚠️ RETRY INSTRUCTIONS — READ FIRST
This is a RETRY. The teacher-facing code is DONE. Do NOT rewrite QuestionBuilder, QuizSettingsPanel, quiz management page, or API routes. They work.

**Your ONLY job is to fix the student-facing integration and TS errors:**

### MUST FIX (5 items):
1. **Import EnhancedQuizOverlay into lesson player page** (`src/app/(dashboard)/lessons/[id]/page.tsx`): Replace or augment the existing quiz overlay to use EnhancedQuizOverlay. Wire `onResponse` to call `POST /api/lessons/[id]/responses`. Wire `onComplete` to resume video playback.
2. **Import ProgressGateModal into lesson player page**: At lesson end, if `quiz_settings.require_pass_to_continue` is true, check quiz_passed. If not passed, show ProgressGateModal. Block lesson completion until passed.
3. **Fix ZodError `.errors` → `.issues`** in 4 files:
   - `src/app/api/lessons/[id]/responses/route.ts` line 31
   - `src/app/api/teacher/lessons/[id]/questions/route.ts` lines 97, 162
   - `src/app/api/teacher/lessons/[id]/route.ts` line 90
4. **Fix enum mismatch in `src/app/(dashboard)/teacher/lessons/[id]/page.tsx`**: Change `fill_blank` references to `fill_in_blank` to match the updated database.types.ts enum.
5. **Delete or update `quiz-management-client.tsx`**: Either delete this dead file or update its imports to use default imports from QuestionBuilder/QuizSettingsPanel.

### DO NOT TOUCH:
- QuestionBuilder.tsx (working)
- QuizSettingsPanel.tsx (working)
- quizzes/page.tsx (working)
- API routes (except the .errors → .issues fix)
- Migration file (already applied)
- database.types.ts (correct)

## Objective
Enhance the existing in-lesson quiz system to meet full PRD section 2.2 requirements: add retry capability, progress gating, multiple question types, and improved teacher management UI.

## Background
The platform currently has basic in-lesson quizzes that:
- Pause video at timestamp
- Show multiple choice question overlay
- Save response to database
- Resume video after answer

Missing features (per PRD 2.2):
- Retry allowed (students can re-attempt until correct)
- Progress gating (optionally require passing quiz to continue video)
- Multiple question types (true/false, fill-in-blank)
- Teacher-friendly quiz management UI

## Acceptance Criteria

### Database Schema (Migration)
1. **Add question_type enum** to `lesson_questions`:
   - `multiple_choice` (existing)
   - `true_false` (new)
   - `fill_in_blank` (new)
   
2. **Add quiz_settings to `lessons` table** (JSONB):
   - `require_pass_to_continue` (boolean, default false)
   - `min_pass_questions` (integer, default: 1)
   - `allow_retries` (boolean, default true)
   - `max_attempts` (integer, nullable - unlimited if null)
   - `show_explanation` (boolean, default true)

3. **Update `lesson_question_responses`**:
   - Add `attempt_number` (integer, default 1)
   - Add `attempts_history` (JSONB array of previous answers)

### Teacher UI - Quiz Management
4. **Create `/teacher/lessons/[id]/quizzes` page**:
   - List all quiz questions for the lesson with timestamps
   - Add new question button
   - Edit/delete existing questions
   - Drag-to-reorder questions
   - Quiz settings panel (require pass, allow retries, etc.)

5. **Create QuestionBuilder component** (reusable):
   - Question type selector (multiple choice / true false / fill blank)
   - Timestamp input (seconds from lesson start)
   - Question text (AR/EN bilingual inputs)
   - Answer configuration:
     - Multiple choice: 2-4 options, mark correct
     - True/False: toggle correct answer
     - Fill in blank: correct answer text input
   - Explanation text (AR/EN, shown after answer)
   - Points/score value

6. **Create QuizSettingsPanel component**:
   - Toggle: Require passing quiz to continue
   - Number input: Minimum questions to pass (if gating enabled)
   - Toggle: Allow retries
   - Number input: Max attempts per question (optional)
   - Toggle: Show explanation after answer

### Student Experience - Enhanced Player
7. **Update lesson player quiz overlay**:
   - Support all three question types with appropriate UI
   - True/False: Two large buttons (صح / خطأ or True / False)
   - Fill-in-blank: Text input with submission

8. **Add retry logic**:
   - If `allow_retries` is true and answer is wrong:
     - Show "Try Again" button
     - Track attempt count
     - Allow re-selection/re-entry
     - Save each attempt to history
   - If max attempts reached: show correct answer, continue

9. **Add progress gating**:
   - If `require_pass_to_continue` is true:
     - Track questions answered correctly
     - If min_pass_questions not met at video end:
       - Show "Quiz Required" modal blocking completion
       - Offer to rewind to missed questions OR
       - Jump back to start of quiz section
     - Prevent marking lesson complete until passed

10. **Enhanced feedback UI**:
    - Instant correct/incorrect visual feedback
    - Explanation panel (if `show_explanation` true)
    - Progress indicator ("Question 2 of 5")
    - Score display

### API Routes
11. **Update `/api/teacher/lessons/content`**:
    - Accept quiz_settings in payload
    - Validate and save to lessons table

12. **Create `/api/teacher/lessons/[id]/questions`**:
    - GET: List all questions for lesson
    - POST: Create new question
    - PATCH: Update question
    - DELETE: Delete question
    - PUT: Reorder questions (batch update sequence)

13. **Update `/api/lessons/[id]/progress`** (existing or create):
    - Track quiz_passed flag in lesson_progress
    - Store quiz_attempts count
    - Update on successful completion

## Key Files to Touch

### Database
- `supabase/migrations/2026022700000_enhanced_in_lesson_quizzes.sql`

### Types
- `src/lib/database.types.ts` - Add question_type enum, quiz_settings type

### Teacher UI
- `src/app/(dashboard)/teacher/lessons/[id]/quizzes/page.tsx` (new)
- `src/components/teacher/QuestionBuilder.tsx` (new)
- `src/components/teacher/QuizSettingsPanel.tsx` (new)
- `src/components/teacher/QuestionList.tsx` (new)

### Student UI (Updates)
- `src/app/(dashboard)/lessons/[id]/page.tsx` - Enhanced quiz overlay
- New components:
  - `src/components/lessons/QuizOverlay.tsx` (extract from page)
  - `src/components/lessons/TrueFalseQuestion.tsx`
  - `src/components/lessons/FillBlankQuestion.tsx`
  - `src/components/lessons/ProgressGateModal.tsx`

### API Routes
- `src/app/api/teacher/lessons/content/route.ts` - Add quiz_settings
- `src/app/api/teacher/lessons/[id]/questions/route.ts` (new)
- `src/app/api/lessons/[id]/responses/route.ts` (new or update)

## Design Notes

### Question Type UI
- **Multiple Choice**: Radio buttons or selectable cards
- **True/False**: Two prominent buttons with icons
- **Fill-in-blank**: Single-line text input with submit button

### Visual Feedback
- Correct: Green background, checkmark, positive message (bilingual)
- Incorrect: Red/amber background, retry option or correct answer reveal

### Bilingual Support
All UI text must support Arabic/English via existing `translations` pattern in lesson player.

## Testing Checklist
1. Teacher can create each question type
2. Questions appear at correct timestamp
3. Video pauses on question
4. Retry works (wrong → try again → correct)
5. Max attempts respected
6. Progress gating blocks completion until passed
7. Explanation shown after answer (when enabled)
8. All progress saved to database
9. Zero TypeScript errors

## Success Criteria
- Full PRD 2.2 compliance
- Teachers can easily create and manage quizzes
- Students have engaging, educational quiz experience
- All interactions bilingual (AR/EN)

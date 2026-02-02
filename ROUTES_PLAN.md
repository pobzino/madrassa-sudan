# Madrassa Sudan - Routes Implementation Plan

## Current State

### Existing Routes
| Route | Status | Description |
|-------|--------|-------------|
| `/` | ✅ Done | Landing page |
| `/auth/login` | ✅ Done | Login page |
| `/auth/signup` | ✅ Done | Signup page |
| `/auth/callback` | ✅ Done | Auth callback |
| `/auth/signout` | ✅ Done | Signout route |
| `/dashboard` | ✅ Done | Student dashboard |
| `/lessons` | ✅ Done | Lessons browser with filtering |
| `/lessons/[id]` | ✅ Done | Video lesson player with questions |
| `/homework` | ✅ Done | Homework list with filtering |
| `/homework/[id]` | ✅ Done | Homework assignment completion |
| `/tutor` | ✅ Done | AI Tutor chat interface |
| `/cohorts` | ✅ Done | My Classes - join/leave classes |
| `/progress` | ✅ Done | Progress & Achievements page |
| `/settings` | ✅ Done | User settings page |

### Database Tables Available
- `profiles` - User profiles (student, teacher, parent, admin)
- `subjects` - Math, Science, English
- `lessons` - Video lessons with metadata
- `lesson_questions` - In-lesson quiz questions
- `lesson_progress` - Track watch time, completion
- `lesson_question_responses` - Student answers to lesson questions
- `homework_assignments` - Teacher-created assignments
- `homework_questions` - Assignment questions
- `homework_submissions` - Student submissions
- `homework_responses` - Individual question answers
- `cohorts` - Classes/groups
- `cohort_students` / `cohort_teachers` - Enrollment
- `ai_conversations` / `ai_messages` - AI tutor chat history
- `student_streaks` - Gamification data
- `organizations` - Schools/orgs (future)

---

## Phase 1: Core Student Experience (Priority: HIGH)

### 1.1 Lessons Browser `/lessons`
**Purpose:** Browse and filter lessons by subject and grade

**Features:**
- Grid of lessons with thumbnails
- Filter by subject (Math, Science, English)
- Filter by grade level
- Search functionality
- Show progress indicators (completed, in-progress, not started)
- Continue where you left off section

**Components Needed:**
- LessonCard (thumbnail, title, duration, progress)
- SubjectFilter tabs
- GradeSelector dropdown
- SearchBar

**Data Flow:**
```
GET /lessons?subject={id}&grade={level}
→ supabase.from('lessons').select('*, lesson_progress(*)')
```

---

### 1.2 Lesson Player `/lessons/[id]`
**Purpose:** Watch video lesson with interactive questions

**Features:**
- Video player with quality options (360p, 480p, 720p)
- Arabic/English captions toggle
- In-video questions at specific timestamps
- Pause video when question appears
- Track watch progress (save position)
- Mark lesson complete
- Navigate to next/previous lesson
- AI Tutor button for help

**Components Needed:**
- VideoPlayer (custom with quality switcher)
- QuestionOverlay (multiple choice, true/false, fill-blank)
- ProgressBar (shows completion %)
- LessonSidebar (lesson list, current position)

**Data Flow:**
```
GET lesson → supabase.from('lessons').select('*, lesson_questions(*)')
SAVE progress → supabase.from('lesson_progress').upsert()
SAVE question response → supabase.from('lesson_question_responses').insert()
```

---

### 1.3 Homework List `/homework`
**Purpose:** View assigned homework

**Features:**
- List of assignments (pending, submitted, graded)
- Filter by status, subject
- Due date countdown
- Score display for graded work
- "Continue" button for in-progress

**Components Needed:**
- HomeworkCard (title, due date, status badge, score)
- StatusFilter tabs
- EmptyState (no homework assigned)

**Data Flow:**
```
GET assignments via cohort membership
→ supabase.from('homework_assignments')
  .select('*, homework_submissions(*)')
  .eq('cohort_id', userCohortId)
```

---

### 1.4 Homework Assignment `/homework/[id]`
**Purpose:** Complete and submit homework

**Features:**
- Display questions one-by-one or all at once
- Question types: multiple choice, short answer, long answer, file upload
- Auto-save drafts
- Submit button with confirmation
- View feedback after grading
- AI Tutor help button per question

**Components Needed:**
- QuestionRenderer (handles all question types)
- MultipleChoiceQuestion
- ShortAnswerQuestion
- LongAnswerQuestion
- FileUploadQuestion
- SubmitConfirmModal
- FeedbackDisplay

**Data Flow:**
```
GET assignment → supabase.from('homework_assignments').select('*, homework_questions(*)')
GET/CREATE submission → supabase.from('homework_submissions')
SAVE responses → supabase.from('homework_responses').upsert()
SUBMIT → update submission status to 'submitted'
```

---

### 1.5 AI Tutor `/tutor`
**Purpose:** Chat with AI tutor for help

**Features:**
- Chat interface (like ChatGPT)
- Context-aware: knows current lesson/homework
- Arabic + English support
- Voice input (optional, future)
- Save conversation history
- Quick prompts: "Explain this", "Give me an example"

**Components Needed:**
- ChatInterface
- MessageBubble (user/assistant)
- ChatInput with send button
- QuickPrompts
- ConversationHistory sidebar

**API Route Needed:** `/api/tutor`
```typescript
POST /api/tutor
{
  message: string,
  conversation_id?: string,
  context?: { lesson_id?, homework_id?, subject_id? }
}
→ OpenAI API call with system prompt
→ Save to ai_messages table
→ Return response
```

---

### 1.6 My Classes `/cohorts`
**Purpose:** View enrolled classes, join new ones

**Features:**
- List of enrolled classes
- Class details (teacher, students count)
- Join class with code
- Leave class option

**Components Needed:**
- CohortCard (name, teacher, grade level)
- JoinCohortModal (enter code)
- EmptyState (not enrolled)

---

### 1.7 Progress & Achievements `/progress`
**Purpose:** View learning stats and achievements

**Features:**
- Overall stats (lessons, homework, streak)
- Progress by subject (pie/bar charts)
- Achievement badges
- Weekly activity heatmap
- Leaderboard (optional)

**Components Needed:**
- StatsOverview
- SubjectProgress bars
- BadgeGrid
- ActivityCalendar
- Streak display

---

### 1.8 Settings `/settings`
**Purpose:** User preferences

**Features:**
- Profile info (name, avatar)
- Language preference (Arabic/English)
- Grade level
- Notification settings
- Change password
- Delete account

**Components Needed:**
- ProfileForm
- LanguageToggle
- PasswordChangeForm
- DangerZone (delete account)

---

## Phase 2: Teacher Dashboard (Priority: MEDIUM)

### 2.1 Teacher Dashboard `/teacher`
**Purpose:** Teacher overview

**Features:**
- Quick stats (total students, assignments, pending grading)
- Recent activity
- Quick actions (create assignment, view class)

---

### 2.2 Manage Classes `/teacher/cohorts`
**Purpose:** Create and manage classes

**Features:**
- List of teacher's classes
- Create new class (name, grade, description)
- View/copy join code
- Archive class

---

### 2.3 Class Details `/teacher/cohorts/[id]`
**Purpose:** Manage single class

**Features:**
- Student list with progress
- Assignments for this class
- Class analytics
- Remove students
- Edit class details

---

### 2.4 Create Homework `/teacher/homework/create`
**Purpose:** Create new assignment

**Features:**
- Title, description (AR/EN)
- Select class(es)
- Add questions (multi-type)
- Set due date
- Point values
- Publish/draft

---

### 2.5 Grade Submissions `/teacher/homework/[id]/grade`
**Purpose:** Grade student submissions

**Features:**
- List of submissions (pending/graded)
- View student responses
- Add points per question
- Add feedback comments
- Bulk grade for auto-gradable questions

---

## Phase 3: Parent Dashboard (Priority: LOW)

### 3.1 Parent Dashboard `/parent`
- View linked children
- See each child's progress
- Activity notifications

### 3.2 Child Progress `/parent/child/[id]`
- Detailed view of child's learning
- Completed lessons, homework scores
- Attendance/streak

---

## Phase 4: API Routes (Priority: HIGH)

### 4.1 `/api/tutor` - AI Tutor
```typescript
// POST: Send message to AI tutor
// Uses OpenAI API with custom system prompt
// Saves conversation to database
```

### 4.2 `/api/lesson-progress` - Save Progress
```typescript
// POST: Update lesson watch progress
// Tracks: position, watch time, completion
```

### 4.3 `/api/homework/submit` - Submit Homework
```typescript
// POST: Submit homework assignment
// Validates all required questions answered
// Updates submission status
```

### 4.4 `/api/homework/auto-grade` - Auto-grade MCQs
```typescript
// POST: Automatically grade multiple choice questions
// Compares with correct_answer field
```

---

## Implementation Order (Recommended)

### Sprint 1 (Week 1-2): Core Lessons
1. `/lessons` - Lessons list page
2. `/lessons/[id]` - Lesson player with video
3. `/api/lesson-progress` - Progress saving
4. `/settings` - Basic settings page

### Sprint 2 (Week 3-4): Homework Flow
5. `/homework` - Homework list
6. `/homework/[id]` - Homework completion
7. `/api/homework/submit` - Submission API
8. `/cohorts` - My classes (join)

### Sprint 3 (Week 5-6): AI Tutor
9. `/tutor` - AI chat interface
10. `/api/tutor` - OpenAI integration
11. `/progress` - Progress page

### Sprint 4 (Week 7-8): Teacher Tools
12. `/teacher` - Teacher dashboard
13. `/teacher/cohorts` - Class management
14. `/teacher/homework/create` - Create assignments
15. `/teacher/homework/[id]/grade` - Grading interface

### Sprint 5 (Week 9-10): Polish & Parent
16. Parent dashboard
17. Notifications
18. Performance optimization
19. Testing & bug fixes

---

## Shared Components to Build

| Component | Used By |
|-----------|---------|
| `VideoPlayer` | Lesson player |
| `QuestionRenderer` | Lessons, Homework |
| `ChatInterface` | AI Tutor |
| `ProgressBar` | Multiple pages |
| `EmptyState` | Multiple pages |
| `FilterTabs` | Lessons, Homework |
| `Card` variants | Multiple pages |
| `Modal` | Multiple pages |
| `Form` components | Settings, Teacher |

---

## Technical Notes

### Video Player Requirements
- Support multiple qualities
- Custom controls (not native)
- Caption tracks (VTT format)
- Remember position on unmount
- Disable seeking past current max position (anti-skip)

### AI Tutor System Prompt
```
You are a friendly, patient tutor helping Sudanese students learn.
- Communicate in {user's preferred language}
- Use simple, clear explanations
- Encourage the student
- If asked about current lesson/homework, use the provided context
- Never give direct answers to homework, guide instead
```

### Authentication Considerations
- Middleware already protects /dashboard, /lessons, /homework, /tutor
- Add /teacher/* and /parent/* to protected routes
- Role-based access: check profile.role before rendering teacher/parent pages

### Mobile Considerations
- All pages must be mobile-responsive
- Video player: fullscreen on mobile
- Touch-friendly question interfaces
- Bottom navigation on mobile (optional)

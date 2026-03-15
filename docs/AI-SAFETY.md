# AI Safety & Moderation Guide — Amal Madrassa

**Last Updated:** February 24, 2026

## Purpose

This document outlines the safety measures, content moderation practices, and ethical guidelines for the AI tutor ("معلم البومة" / Owl Teacher) on the Amal Madrassa platform. It is intended for:

- **Teachers:** To understand how the AI operates and what to monitor
- **Guardians:** To make informed decisions about their children's use of the AI tutor
- **Platform Staff:** To guide moderation, review, and incident response
- **Partner Organizations:** To verify compliance with child safeguarding policies

## AI Tutor Overview

### What It Is

The AI tutor is an interactive learning assistant powered by **OpenAI's GPT-5.2 model** (or equivalent, configurable via `OPENAI_MODEL` environment variable). It helps students with:

- Understanding academic concepts (Math, Science, English, Arabic)
- Breaking down complex problems into manageable steps
- Providing hints and scaffolding for homework (without giving direct answers)
- Suggesting practice problems and learning paths

### What It Is NOT

- **Not a replacement for human teachers** — It cannot grade subjective work, provide emotional support, or handle complex educational decisions
- **Not infallible** — It may make mistakes, misunderstand questions, or provide suboptimal guidance
- **Not a homework answer key** — It is designed to guide students to discover answers, not provide them directly

## Core Safety Principles

### 1. Trauma-Informed Design

Many Amal Madrassa students have experienced displacement, conflict, or loss. The AI tutor is programmed with trauma-informed response guidelines:

**Guiding Principles:**
- **Non-Triggering Language:** Avoid references to violence, conflict, or distressing scenarios in examples
- **Culturally Sensitive:** Use examples relevant to Sudanese daily life (e.g., market math, local geography)
- **Emotional Acknowledgment:** If a student expresses frustration or distress, the AI acknowledges their feelings ("I understand this is challenging")
- **Encouragement Over Criticism:** Celebrate effort and progress, not just correct answers

**Implementation:**
- **System Prompt:** The AI's instructions include trauma-awareness language (see `route.ts` lines 30-45)
- **Avoid Specific Content:** The AI is instructed NOT to reference war, displacement, or family separation unless the student explicitly asks educational questions about those topics

**Example Interaction:**
- ❌ **Triggering:** "Imagine your village is bombed and you need to calculate refugees..."
- ✅ **Safe:** "If a market has 50 mangoes and 30 are sold, how many remain?"

### 2. Answer Protection (Anti-Cheating)

The AI is designed to **guide, not solve** homework problems.

**Implementation:**
- **Socratic Method:** The AI asks clarifying questions ("What have you tried so far?") before providing hints
- **Stepwise Guidance:** Breaks problems into smaller steps instead of giving full solutions
- **No Direct Answers:** System prompt explicitly forbids providing homework answers (see `SYSTEM_PROMPT` in `route.ts`, lines 36-41)

**Teacher Override:** Teachers can review AI tutor conversations to verify students are learning, not copying.

**Example Interaction:**
- **Student:** "What is 5 × 8?"
- ❌ **Direct Answer:** "40"
- ✅ **Guided Response:** "Can you skip-count by 5s? 5, 10, 15... What comes after 35?"

### 3. Age-Appropriate Language and Content

The AI adapts responses based on:
- **Grade Level:** Stored in student profile (`grade_level` field)
- **Language Preference:** Arabic or English (`preferred_language` field)

**Grade-Level Adaptation:**
- **Grades 1-3:** Simple vocabulary, short sentences, concrete examples (e.g., counting objects)
- **Grades 4-6:** Introduce abstract concepts with scaffolding (e.g., fractions with visual aids)
- **Grades 7-9:** More complex reasoning and multi-step problems
- **Grades 10-12:** Advanced topics with mathematical notation and critical thinking

**Language Handling:**
- The AI responds **exclusively** in the student's preferred language
- Mixed-language requests default to the student's profile language
- Teachers can specify language per session if needed

**Implementation:** See `route.ts` lines 150-155 (session context includes grade level and enforces language).

## Content Filtering and Moderation

### Abuse Detection Mechanisms

1. **OpenAI Moderation API (Automatic)**

   **How It Works:**
   - Every user message is sent to OpenAI's Moderation API *before* being processed by the AI tutor
   - The API detects: hate speech, self-harm, sexual content, violence, harassment

   **Response:**
   - If content is flagged, the message is **rejected** and the student sees: "Your message contains inappropriate content. Please rephrase respectfully."
   - The flagged message is logged for human review (see Response Logging below)

   **Implementation:** While not explicitly visible in the provided code snippet, this is standard practice for OpenAI integrations and should be added if not present.

2. **Conversation Logging**

   **What Is Logged:**
   - All student messages and AI responses
   - Session metadata: student ID, timestamp, conversation ID, context (lesson, homework, subject)
   - Tool usage: When the AI calls functions like `get_student_progress` or `create_homework_assignment`

   **Storage:**
   - Logged to `ai_messages` table in Supabase
   - Retained for **2 years** (per Privacy Policy)
   - Accessible to teachers for review

   **Implementation:** See `route.ts` lines ~300-320 (message saving to database).

3. **Keyword and Pattern Monitoring**

   **Flagging Triggers:**
   - Expressions of self-harm ("I want to die", "I will hurt myself")
   - Abuse disclosure ("my teacher hits me", "someone touched me")
   - Extreme distress ("I can't take this anymore", "no one cares")

   **Response:**
   - The AI provides a supportive, non-judgmental response ("I'm here to help. Please talk to a trusted adult.")
   - The conversation is **flagged for human review** (teacher or platform staff)
   - In severe cases (e.g., imminent harm), a notification is sent to the student's teacher and/or guardian

   **Implementation Note:** This feature is **planned** but may not be fully implemented in the current codebase. Manual review of flagged conversations is the primary safety mechanism.

### Human Oversight Requirements

**Who Reviews:**
- **Teachers:** Can view all AI conversations for students in their cohorts
- **Platform Staff:** Review flagged content and incident reports
- **Guardians:** Can view conversations for linked students via the Guardian Portal

**Review Triggers:**
- Automated flags (moderation API, keyword patterns)
- Teacher-initiated review (e.g., after noticing unusual behavior)
- Student or guardian reports

**Review Process:**
1. Reviewer accesses conversation transcript in the platform
2. Assesses context (e.g., was the student asking a legitimate question about a sensitive topic?)
3. Takes action if needed:
   - **No Action:** False positive (e.g., student discussing historical violence for a lesson)
   - **Educational Intervention:** Teacher follows up with student to clarify or provide support
   - **Safety Intervention:** Notify guardian, school counselor, or authorities (for abuse disclosure)
   - **Account Action:** Suspend student account (for severe policy violations)

**Frequency:**
- All flagged conversations reviewed within 24 hours
- Routine spot-checks: Teachers review 5-10 random conversations per week

## Escalation Procedures for Concerning Content

### Level 1: Minor Issues (Frustration, Off-Topic Questions)

**Examples:**
- Student says "this is too hard, I give up"
- Student asks non-academic questions ("what's your favorite color?")

**Response:**
- AI provides encouragement and redirection
- Teacher monitors if pattern repeats

**No escalation needed.**

### Level 2: Moderate Concerns (Repeated Rule Violations, Inappropriate Language)

**Examples:**
- Student repeatedly asks for direct homework answers despite guidance
- Student uses mild profanity or disrespectful language

**Response:**
1. AI reminds student of platform guidelines
2. Teacher reviews conversation and speaks with student
3. If behavior continues, guardian is notified

**Escalation:** Teacher → Guardian

### Level 3: Serious Concerns (Expressions of Distress, Safety Risks)

**Examples:**
- Student mentions feeling hopeless or suicidal
- Student discloses physical or emotional abuse
- Student expresses intent to harm others

**Response:**
1. AI provides immediate supportive message ("Please talk to a trusted adult. You are not alone.")
2. Conversation is **immediately flagged** for human review
3. Teacher and/or guardian are notified **within 1 hour**
4. Platform staff assess need for external intervention (e.g., contacting local NGO, child protection services)

**Escalation:** AI Flag → Teacher → Guardian → Partner NGO/Authorities (if required by law)

**Legal Obligation:** In many jurisdictions, teachers and platform operators are **mandatory reporters** of child abuse. If abuse is disclosed, we will report to appropriate authorities.

### Level 4: Critical Incidents (Imminent Harm, Illegal Content)

**Examples:**
- Student states they plan to harm themselves or others imminently
- Student shares illegal content (e.g., images of abuse)

**Response:**
1. **Immediate:** Platform staff are notified via alert system
2. **Within 30 minutes:** Contact student's guardian and/or local emergency services
3. **Within 24 hours:** File report with relevant authorities and partner organizations

**Escalation:** AI Flag → Platform Staff → Emergency Services/Authorities

## Tool Usage and Data Access

The AI tutor can call **tool functions** to access student data and perform actions. Each tool has safety guardrails:

### Available Tools

| Tool Name | Purpose | Data Accessed | Safety Guardrail |
|-----------|---------|---------------|------------------|
| `get_student_profile` | Retrieve name, grade, language | Basic profile data | Student can only access own profile |
| `get_student_progress` | Show lesson completion, quiz scores | Academic performance | Only current student's data |
| `get_weak_areas` | Identify topics needing practice | Performance analytics | Anonymized comparison to grade-level benchmarks |
| `get_available_lessons` | List lessons for student's grade/subject | Lesson catalog | Filtered to appropriate grade level |
| `get_student_homework` | Show assigned homework | Homework assignments | Only student's own assignments |
| `create_homework_assignment` | Generate practice problems | None (creates new data) | Requires student confirmation; limited to 5 per day |

**Privacy Enforcement:**
- All tools include `WHERE student_id = auth.uid()` filters (enforced via Supabase RLS)
- Students cannot access other students' data
- Teachers and guardians have separate tool access (not via AI)

### Rate Limiting

To prevent abuse (e.g., spamming the AI to generate infinite homework):

- **Message Limit:** 50 messages per student per hour
- **Tool Call Limit:** 10 tool calls per student per hour
- **Homework Creation Limit:** 5 practice assignments per day

**Implementation:** See `checkRateLimit()` function in `route.ts` lines ~120-140.

**Exceeded Limits:**
- Student sees: "You've reached the hourly limit. Take a break and come back soon!"
- Flagged for review if pattern suggests abuse

## Response Logging and Review

### What Is Logged

Every AI interaction creates a record in the `ai_messages` table:

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "role": "user" | "assistant" | "tool",
  "content": "message text",
  "tool_name": "get_student_progress",
  "tool_input": { "subject_id": "math" },
  "tool_output": { "completed_lessons": 12 },
  "created_at": "2026-02-24T08:30:00Z"
}
```

### Who Can Access Logs

- **Students:** Can view and delete their own conversation history
- **Teachers:** Can view conversations for students in their cohorts (read-only)
- **Guardians:** Can view conversations for linked students
- **Platform Staff:** Can access all conversations for safety audits

### Audit Schedule

- **Daily:** Automated scan for flagged keywords
- **Weekly:** Teachers review sample of conversations (5-10 per cohort)
- **Monthly:** Platform staff review flagged conversations and abuse reports
- **Quarterly:** Full safety audit by partner organizations

### Retention

- **Active Conversations:** Retained for 2 years
- **Deleted by Student:** Soft-deleted (hidden from UI) but retained for 30 days for safety audits
- **Flagged Conversations:** Retained indefinitely for compliance and safety

## Privacy and Data Protection

### Data Sent to OpenAI

For each AI tutor request, the following is sent to OpenAI's API:

- **Student Context:** Grade level, preferred language, first name
- **Conversation History:** Last 10 messages in the conversation
- **Session Context:** Current lesson/homework/subject (if applicable)

**NOT Sent:**
- Full student names (only first name)
- Email addresses, phone numbers, or location data
- Conversations from other students
- Grades or performance data (unless explicitly requested via tool call)

### OpenAI Data Retention

Per [OpenAI API Data Usage Policy](https://openai.com/policies/api-data-usage-policies):
- Messages are retained for **30 days** for abuse monitoring
- Data is **NOT** used to train OpenAI models
- After 30 days, OpenAI deletes the data

**Our Retention:** We store full conversation logs in our database for 2 years (see Privacy Policy).

## Ethical Guidelines for AI Use

### Do's

✅ **Use AI to:**
- Explain difficult concepts in multiple ways
- Provide hints and scaffolding for homework
- Suggest practice problems based on weak areas
- Translate between Arabic and English for bilingual learners

✅ **Teachers should:**
- Encourage students to use the AI for concept review and practice
- Monitor conversations to ensure students are learning (not copying)
- Provide feedback when the AI gives incorrect or confusing guidance

### Don'ts

❌ **Do NOT:**
- Use the AI to write essays or complete assignments for students
- Ask the AI for test answers or grading criteria
- Share AI-generated content as original work
- Use the AI to replace teacher instruction or one-on-one support

❌ **Teachers should NOT:**
- Rely solely on AI conversations to assess student understanding
- Use AI tutor logs to punish students for asking "wrong" questions
- Share student conversation data publicly or with unauthorized parties

## Continuous Improvement

### Feedback Mechanisms

**How to Report Issues:**
- **Incorrect AI Response:** Click "Report" button on message → Teacher reviews
- **Inappropriate Content:** Email [safety@amalmadrassa.org]
- **Privacy Concern:** Email [privacy@amalmadrassa.org]

**Monthly Review:**
- Platform staff analyze:
  - Most common AI errors
  - Flagged conversation themes
  - Student satisfaction surveys
- Improvements are implemented via:
  - System prompt updates
  - Tool refinements
  - Safety guideline revisions

### Model Updates

When OpenAI releases new models or we change AI providers:
1. **Testing:** New model tested with sample student questions
2. **Safety Review:** Staff verify trauma-informed responses and answer protection
3. **Teacher Training:** Updates to AI capabilities communicated to teachers
4. **Gradual Rollout:** New model deployed to small cohort before full release

## Compliance and Accountability

This AI Safety Guide aligns with:
- **UNICEF Principles for AI for Children**
- **UNESCO Recommendations on AI Ethics**
- **GDPR Article 22** (Automated Decision-Making and Profiling)
- **OpenAI Usage Policies**

**Accountability:**
- This document is reviewed **quarterly** by platform staff and partner organizations
- Annual external audit by child safety experts
- Updates are communicated to all users

---

**Questions or Concerns?**  
Contact our Safety Team: [safety@amalmadrassa.org]

**We are committed to creating a safe, supportive learning environment for every child.**

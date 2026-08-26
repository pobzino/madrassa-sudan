import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";
const JSON_ONLY = process.argv.includes("--json");
const LESSON_ID = process.argv
  .find((value) => value.startsWith("--lesson="))
  ?.slice("--lesson=".length);

if (!PROJECT_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY), and OPENAI_API_KEY."
  );
}

const supabase = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slideContent(deck) {
  if (!Array.isArray(deck)) return "";
  return deck
    .map((slide, index) => {
      const parts = [`Slide ${index + 1} (${text(slide?.type) || "content"})`];
      const title = text(slide?.title_ar) || text(slide?.title_en);
      const body = text(slide?.body_ar) || text(slide?.body_en);
      const bullets = Array.isArray(slide?.bullets_ar) && slide.bullets_ar.length
        ? slide.bullets_ar
        : slide?.bullets_en;
      const notes = text(slide?.speaker_notes_ar) || text(slide?.speaker_notes_en);
      const activity = text(slide?.interaction_prompt_ar) || text(slide?.interaction_prompt_en);
      if (title) parts.push(`Title: ${title}`);
      if (body) parts.push(`Content: ${body}`);
      if (Array.isArray(bullets) && bullets.length) parts.push(`Key points: ${bullets.join("; ")}`);
      if (notes) parts.push(`Notes: ${notes}`);
      if (activity) parts.push(`Activity: ${activity}`);
      return parts.join("\n");
    })
    .join("\n\n")
    .slice(0, 18_000);
}

async function loadRows(table, select, configure = (query) => query) {
  const { data, error } = await configure(supabase.from(table).select(select));
  if (error) throw error;
  return data || [];
}

const [lessons, assignments, questions, sims, slideDecks] = await Promise.all([
  loadRows(
    "lessons",
    "id, title_ar, title_en, grade_level, is_published, subject:subjects(name_ar, name_en)",
    (query) => query.eq("is_published", true)
  ),
  loadRows(
    "homework_assignments",
    "id, lesson_id, title_ar, title_en, is_published, is_practice",
    (query) => query.eq("is_practice", true).eq("is_published", true)
  ),
  loadRows(
    "homework_questions",
    "id, assignment_id, display_order, question_type, question_text_ar, question_text_en, options_ar, options_en, correct_option_index, correct_answer",
    (query) => query.order("display_order", { ascending: true })
  ),
  loadRows(
    "lesson_sims",
    "lesson_id, deck_snapshot, recorded_at",
    (query) => query.order("recorded_at", { ascending: false })
  ),
  loadRows("lesson_slides", "lesson_id, slides"),
]);

const assignmentByLesson = new Map(
  assignments.filter((item) => item.lesson_id).map((item) => [item.lesson_id, item])
);
const questionsByAssignment = new Map();
for (const question of questions) {
  const current = questionsByAssignment.get(question.assignment_id) || [];
  current.push(question);
  questionsByAssignment.set(question.assignment_id, current);
}
const sourceByLesson = new Map();
for (const sim of sims) {
  if (!sourceByLesson.has(sim.lesson_id) && Array.isArray(sim.deck_snapshot)) {
    sourceByLesson.set(sim.lesson_id, sim.deck_snapshot);
  }
}
for (const deck of slideDecks) {
  if (!sourceByLesson.has(deck.lesson_id) && Array.isArray(deck.slides)) {
    sourceByLesson.set(deck.lesson_id, deck.slides);
  }
}

const reviewSchema = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocking", "major", "minor"] },
          code: {
            type: "string",
            enum: [
              "off_topic",
              "not_self_contained",
              "ambiguous",
              "wrong_answer",
              "bad_translation",
              "duplicate",
              "age_inappropriate",
              "weak_distractors",
              "poor_coverage",
              "formatting",
            ],
          },
          question_orders: { type: "array", items: { type: "integer" } },
          detail: { type: "string" },
        },
        required: ["severity", "code", "question_orders", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["approved", "score", "summary", "issues"],
  additionalProperties: false,
};

async function reviewLesson(lesson) {
  const assignment = assignmentByLesson.get(lesson.id);
  const practiceQuestions = assignment
    ? questionsByAssignment.get(assignment.id) || []
    : [];
  const subject = Array.isArray(lesson.subject) ? lesson.subject[0] : lesson.subject;
  const source = slideContent(sourceByLesson.get(lesson.id));

  if (!assignment || practiceQuestions.length !== 10 || !source) {
    return {
      lesson_id: lesson.id,
      lesson_title: lesson.title_en || lesson.title_ar,
      approved: false,
      score: 0,
      summary: !assignment
        ? "Published lesson has no published Practice."
        : !source
          ? "Published lesson has no readable slide source."
          : `Practice has ${practiceQuestions.length} questions instead of 10.`,
      issues: [],
    };
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an exacting primary-education assessment reviewer. Reject weak work instead of being polite.",
      },
      {
        role: "user",
        content: `Review this bilingual Amal School Practice for a Sudanese child aged roughly 6-10 studying independently on a phone.

Approve only if all 10 questions:
- test material explicitly taught in the lesson source;
- are self-contained without an unseen picture, missing audio cue, teacher gesture, or unexplained context;
- have exactly one unambiguous correct answer and accurate auto-marking;
- have natural, meaning-aligned Arabic and English (English target words may remain in Latin script);
- use plausible but clearly wrong distractors;
- avoid duplicate questions, trick wording, personal-opinion questions, and age-inappropriate language;
- collectively cover the lesson's main learning goals instead of repeating one tiny skill.

Important judging rules:
- The database intentionally stores true/false correct_answer as the canonical strings "true" or "false". That is correct and must not be flagged.
- For multiple-choice items, correct_answer intentionally stores the Arabic option at correct_option_index. Judge correctness from the aligned Arabic and English options and index; do not require an English duplicate in correct_answer.
- A text question does not need to reproduce every picture or listening activity from the lesson. Flag missing context only when the question itself refers to context it does not include.
- A lesson with only a few target words or facts may test them more than once if the situation or thinking task is meaningfully different.
- A taught arithmetic operation, phonics rule, grammar pattern, or other reusable method may be applied to fresh age-appropriate examples. Do not require exact numbers or sentences to be copied from the slides.
- Differences in capitalization and punctuation are meaningful when a question explicitly tests writing conventions; do not call those answer choices duplicates.
- Do not demand learning goals that are absent from the source.
- Question numbers must be the 1-based array positions from this ten-question Practice. Never report a question outside 1-10.
- Use blocking or major only for a concrete defect that requires correction. Optional variety, imperfect distribution, or a nonessential coverage opportunity is minor.
- If an issue explanation admits that the item is correct, acceptable, or self-contained, do not report that issue.

Use approved=true only for a score of at least 85 with no blocking or major issues. Avoid stylistic nitpicks that do not affect learning or auto-marking.

LESSON
Title: ${lesson.title_en || lesson.title_ar}
Subject: ${subject?.name_en || subject?.name_ar || "General"}
Grade: ${lesson.grade_level || 1}

LESSON SOURCE
${source}

PRACTICE
${JSON.stringify(practiceQuestions)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "practice_quality_review", strict: true, schema: reviewSchema },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error(`No review returned for lesson ${lesson.id}.`);
  return {
    lesson_id: lesson.id,
    lesson_title: lesson.title_en || lesson.title_ar,
    subject: subject?.name_en || subject?.name_ar || "General",
    ...JSON.parse(content),
  };
}

const lessonsToReview = LESSON_ID
  ? lessons.filter((lesson) => lesson.id === LESSON_ID)
  : lessons;
if (LESSON_ID && lessonsToReview.length === 0) {
  throw new Error(`Published lesson ${LESSON_ID} was not found.`);
}

const results = new Array(lessonsToReview.length);
let nextIndex = 0;
async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= lessonsToReview.length) return;
    const lesson = lessonsToReview[index];
    try {
      results[index] = await reviewLesson(lesson);
    } catch (error) {
      results[index] = {
        lesson_id: lesson.id,
        lesson_title: lesson.title_en || lesson.title_ar,
        approved: false,
        score: 0,
        summary: error instanceof Error ? error.message : "Review failed.",
        issues: [],
      };
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(3, lessonsToReview.length) }, () => worker())
);

const report = {
  generated_at: new Date().toISOString(),
  model: MODEL,
  lessons_reviewed: results.length,
  approved: results.filter((item) => item.approved).length,
  needs_revision: results.filter((item) => !item.approved).length,
  results,
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const item of results) {
    const label = item.approved ? "PASS" : "REVISE";
    console.log(`${label}\t${String(item.score).padStart(3)}\t${item.lesson_title}`);
    if (!item.approved) console.log(`  ${item.summary}`);
  }
  console.log(
    `Reviewed ${report.lessons_reviewed}: ${report.approved} passed, ${report.needs_revision} need revision.`
  );
}

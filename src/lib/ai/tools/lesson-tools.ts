// Lesson-related AI tools

import { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { ToolExecutionResult, StudentContext, LessonSummary } from "../types";
import { getPreferredLanguage, localizeSubjectName, localizeText } from "./utils";

const EMBEDDING_MODEL = "text-embedding-3-small";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

// Get available lessons for student
export async function getAvailableLessons(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const subjectId = params.subject_id as string | undefined;
    const limit = (params.limit as number) || 10;
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Build query for lessons at or below student's grade level
    let query = supabase
      .from("lessons")
      .select(`
        id,
        title_ar,
        title_en,
        grade_level,
        display_order,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `)
      .eq("is_published", true)
      .order("grade_level", { ascending: true })
      .order("display_order", { ascending: true })
      .limit(limit);

    // Filter by grade level if student has one
    if (studentContext.grade_level) {
      query = query.lte("grade_level", studentContext.grade_level);
    }

    // Filter by subject if specified
    if (subjectId) {
      query = query.eq("subject_id", subjectId);
    }

    const { data: lessons, error: lessonsError } = await query;
    if (lessonsError) throw lessonsError;

    // Get student's progress for these lessons
    const lessonIds = lessons?.map((l) => l.id) || [];
    const { data: progress, error: progressError } = await supabase
      .from("lesson_progress")
      .select("lesson_id, completed, questions_correct, questions_answered")
      .eq("student_id", studentContext.id)
      .in("lesson_id", lessonIds);

    if (progressError) throw progressError;

    // Create progress map
    const progressMap = new Map(progress?.map((p) => [p.lesson_id, p]) || []);

    // Build lesson summaries
    const lessonSummaries: LessonSummary[] = lessons?.map((lesson) => {
      const lessonProgress = progressMap.get(lesson.id);
      const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;

      return {
        id: lesson.id,
        title_ar: lesson.title_ar,
        title_en: lesson.title_en || "",
        title: localizeText(lang, lesson.title_ar, lesson.title_en || "", ""),
        subject_id: subject?.id || "",
        subject_name_ar: subject?.name_ar || "",
        subject_name_en: subject?.name_en || "",
        subject_name: localizeSubjectName(lang, subject),
        grade_level: lesson.grade_level,
        completed: lessonProgress?.completed || false,
        progress_percentage: lessonProgress
          ? lessonProgress.questions_answered > 0
            ? Math.round((lessonProgress.questions_correct / lessonProgress.questions_answered) * 100)
            : 0
          : 0,
      };
    }) || [];

    return {
      success: true,
      data: {
        lessons: lessonSummaries,
        total_count: lessonSummaries.length,
        completed_count: lessonSummaries.filter((l) => l.completed).length,
        summary: localizeText(
          lang,
          `متاح ${lessonSummaries.length} درسًا لك الآن.`,
          `${lessonSummaries.length} lessons are available to you right now.`,
          ""
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get available lessons",
    };
  }
}

// Get detailed lesson information
export async function getLessonDetails(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const lessonId = params.lesson_id as string;

    if (!lessonId) {
      return {
        success: false,
        error: "lesson_id is required",
      };
    }

    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get lesson with content
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select(`
        id,
        title_ar,
        title_en,
        description_ar,
        description_en,
        grade_level,
        display_order,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `)
      .eq("id", lessonId)
      .single();

    if (lessonError) throw lessonError;

    // Get student's progress
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("completed, questions_correct, questions_answered, started_at, completed_at")
      .eq("student_id", studentContext.id)
      .eq("lesson_id", lessonId)
      .single();

    // Get lesson questions
    const { data: questions, error: questionsError } = await supabase
      .from("lesson_questions")
      .select(`
        id,
        question_text_ar,
        question_text_en,
        question_type,
        options,
        display_order
      `)
      .eq("lesson_id", lessonId)
      .order("display_order", { ascending: true });

    if (questionsError) throw questionsError;

    // Get student's responses to questions
    const questionIds = questions?.map((q) => q.id) || [];
    const { data: responses } = await supabase
      .from("lesson_question_responses")
      .select("question_id, is_correct, attempts")
      .eq("student_id", studentContext.id)
      .in("question_id", questionIds);

    const responseMap = new Map(responses?.map((r) => [r.question_id, r]) || []);

    const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;
    const localizedTitle = localizeText(lang, lesson.title_ar, lesson.title_en, "");
    const localizedDescription = localizeText(lang, lesson.description_ar, lesson.description_en, "");
    const contentAr = lesson.description_ar || "";
    const contentEn = lesson.description_en || "";
    const localizedContent = localizeText(lang, contentAr, contentEn, "");

    return {
      success: true,
      data: {
        lesson: {
          id: lesson.id,
          title_ar: lesson.title_ar,
          title_en: lesson.title_en,
          description_ar: lesson.description_ar,
          description_en: lesson.description_en,
          content_ar: contentAr,
          content_en: contentEn,
          title: localizedTitle,
          description: localizedDescription,
          content: localizedContent,
          grade_level: lesson.grade_level,
          subject_id: subject?.id,
          subject_name_ar: subject?.name_ar,
          subject_name_en: subject?.name_en,
          subject_name: localizeSubjectName(lang, subject),
        },
        progress: progress
          ? {
              completed: progress.completed,
              questions_correct: progress.questions_correct,
              questions_answered: progress.questions_answered,
              started_at: progress.started_at,
              completed_at: progress.completed_at,
            }
          : null,
        questions: questions?.map((q) => {
          const response = responseMap.get(q.id);
          return {
            id: q.id,
            question_text_ar: q.question_text_ar,
            question_text_en: q.question_text_en,
            question_type: q.question_type,
            options: q.options,
            answered: !!response,
            correct: response?.is_correct || false,
            attempts: response?.attempts || 0,
          };
        }),
        total_questions: questions?.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get lesson details",
    };
  }
}

// Get a chunk of lesson content for context-aware tutoring
export async function getLessonContentChunk(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const lessonId = params.lesson_id as string;
    const offset = Math.max(0, Number(params.offset ?? 0));
    const limit = Math.max(200, Math.min(2000, Number(params.limit ?? 1200)));
    const lang = getPreferredLanguage(studentContext.preferred_language);

    if (!lessonId) {
      return { success: false, error: "lesson_id is required" };
    }

    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, title_ar, title_en, description_ar, description_en")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) throw lessonError || new Error("Lesson not found");

    let content = "";
    let contentSource: string | null = null;

    try {
      const { data: blocks, error: blocksError } = await supabase
        .from("lesson_content_blocks")
        .select("content, source_type, sequence")
        .eq("lesson_id", lessonId)
        .eq("language", lang)
        .order("sequence", { ascending: true });

      if (!blocksError && blocks && blocks.length > 0) {
        content = blocks.map((b) => b.content).join("\n\n");
        contentSource = blocks[0]?.source_type || "lesson";
      }
    } catch (error) {
      // Fallback to description-based content when the table is missing or inaccessible
      content = "";
    }

    if (!content) {
      content = localizeText(
        lang,
        lesson.description_ar,
        lesson.description_en,
        ""
      );
      contentSource = "description";
    }

    if (!content) {
      return {
        success: false,
        error: "Lesson content is not available",
      };
    }

    const end = Math.min(content.length, offset + limit);
    const chunk = content.slice(offset, end);

    return {
      success: true,
      data: {
        lesson_id: lesson.id,
        title: localizeText(lang, lesson.title_ar, lesson.title_en, ""),
        description: localizeText(lang, lesson.description_ar, lesson.description_en, ""),
        offset,
        limit,
        total_length: content.length,
        is_last: end >= content.length,
        source_type: contentSource,
        chunk,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get lesson content",
    };
  }
}

// Search lessons by keyword
export async function searchLessons(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const queryText = (params.query as string | undefined)?.trim();
    const subjectId = params.subject_id as string | undefined;
    const limit = Math.max(1, Math.min(20, Number(params.limit ?? 10)));
    const lang = getPreferredLanguage(studentContext.preferred_language);

    if (!queryText) {
      return { success: false, error: "query is required" };
    }

    try {
      if (hasOpenAIKey) {
        const embeddingResponse = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: queryText,
        });

        const queryEmbedding = embeddingResponse.data[0]?.embedding;
        if (queryEmbedding) {
          const { data: vectorMatches, error: vectorError } = await supabase.rpc("match_lesson_chunks", {
            query_embedding: queryEmbedding,
            match_count: limit,
            filter_subject_id: subjectId || null,
            filter_grade_level: studentContext.grade_level,
            filter_language: lang,
          });

          if (!vectorError && vectorMatches && vectorMatches.length > 0) {
            const sources = vectorMatches.map((match: {
              lesson_id: string;
              content: string;
              similarity: number;
              source_type: string;
              lesson_title_ar: string | null;
              lesson_title_en: string | null;
              subject_name_ar: string | null;
              subject_name_en: string | null;
            }) => ({
              source_type: match.source_type,
              lesson_id: match.lesson_id,
              title: localizeText(lang, match.lesson_title_ar, match.lesson_title_en, ""),
              subject_name: localizeText(lang, match.subject_name_ar, match.subject_name_en, ""),
              snippet: buildSnippet(match.content, queryText),
              similarity: match.similarity,
            }));

            return {
              success: true,
              data: {
                query: queryText,
                total_sources: sources.length,
                sources,
                summary: localizeText(
                  lang,
                  `وجدت ${sources.length} مراجع مرتبطة بالسؤال.`,
                  `Found ${sources.length} related lesson references.`,
                  ""
                ),
              },
            };
          }
        }
      }
    } catch (error) {
      // Fallback to keyword search if embeddings are unavailable
    }

    let query = supabase
      .from("lessons")
      .select(
        `
        id,
        title_ar,
        title_en,
        description_ar,
        description_en,
        grade_level,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `
      )
      .eq("is_published", true)
      .order("grade_level", { ascending: true })
      .limit(limit);

    if (studentContext.grade_level) {
      query = query.lte("grade_level", studentContext.grade_level);
    }

    if (subjectId) {
      query = query.eq("subject_id", subjectId);
    }

    query = query.or(
      `title_ar.ilike.%${queryText}%,title_en.ilike.%${queryText}%,description_ar.ilike.%${queryText}%,description_en.ilike.%${queryText}%`
    );

    const { data: lessons, error } = await query;
    if (error) throw error;

    const results = (lessons || []).map((lesson) => {
      const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;
      return {
        id: lesson.id,
        title_ar: lesson.title_ar,
        title_en: lesson.title_en,
        description_ar: lesson.description_ar,
        description_en: lesson.description_en,
        title: localizeText(lang, lesson.title_ar, lesson.title_en, ""),
        description: localizeText(lang, lesson.description_ar, lesson.description_en, ""),
        grade_level: lesson.grade_level,
        subject_id: subject?.id,
        subject_name_ar: subject?.name_ar,
        subject_name_en: subject?.name_en,
        subject_name: localizeSubjectName(lang, subject),
      };
    });

    return {
      success: true,
      data: {
        query: queryText,
        total: results.length,
        lessons: results,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to search lessons",
    };
  }
}

function buildSnippet(text: string, query: string, maxLength = 240) {
  if (!text) return "";
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + maxLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

// Get lesson context for grounding explanations
export async function getLessonContext(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const queryText = (params.query as string | undefined)?.trim();
    const subjectId = params.subject_id as string | undefined;
    const limit = Math.max(1, Math.min(5, Number(params.limit ?? 3)));
    const lang = getPreferredLanguage(studentContext.preferred_language);

    if (!queryText) {
      return { success: false, error: "query is required" };
    }

    let lessonQuery = supabase
      .from("lessons")
      .select(
        `
        id,
        title_ar,
        title_en,
        description_ar,
        description_en,
        grade_level,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `
      )
      .eq("is_published", true)
      .or(
        `title_ar.ilike.%${queryText}%,title_en.ilike.%${queryText}%,description_ar.ilike.%${queryText}%,description_en.ilike.%${queryText}%`
      )
      .limit(6);

    if (studentContext.grade_level) {
      lessonQuery = lessonQuery.lte("grade_level", studentContext.grade_level);
    }

    if (subjectId) {
      lessonQuery = lessonQuery.eq("subject_id", subjectId);
    }

    const { data: lessons, error: lessonError } = await lessonQuery;
    if (lessonError) throw lessonError;

    const { data: questions, error: questionError } = await supabase
      .from("lesson_questions")
      .select(
        `
        id,
        question_text_ar,
        question_text_en,
        question_type,
        lesson:lessons (
          id,
          title_ar,
          title_en,
          grade_level,
          subject_id,
          subject:subjects (
            id,
            name_ar,
            name_en
          )
        )
      `
      )
      .or(`question_text_ar.ilike.%${queryText}%,question_text_en.ilike.%${queryText}%`)
      .limit(10);

    if (questionError) throw questionError;

    const lessonSources = (lessons || []).map((lesson) => {
      const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;
      const description = localizeText(lang, lesson.description_ar, lesson.description_en, "");
      return {
        source_type: "lesson_description",
        lesson_id: lesson.id,
        title: localizeText(lang, lesson.title_ar, lesson.title_en, ""),
        subject_id: subject?.id || "",
        subject_name: localizeSubjectName(lang, subject),
        snippet: buildSnippet(description, queryText),
      };
    });

    const questionSources = (questions || [])
      .filter((q) => {
        const lesson = q.lesson as unknown as { subject_id?: string | null; grade_level?: number | null } | null;
        if (subjectId && lesson?.subject_id && lesson.subject_id !== subjectId) return false;
        if (studentContext.grade_level && lesson?.grade_level && lesson.grade_level > studentContext.grade_level) return false;
        return true;
      })
      .map((q) => {
        const lesson = q.lesson as unknown as {
          id: string;
          title_ar: string;
          title_en: string;
          subject?: { id: string; name_ar: string; name_en: string } | null;
        } | null;
        const text = localizeText(lang, q.question_text_ar, q.question_text_en, "");
        return {
          source_type: "lesson_question",
          lesson_id: lesson?.id || "",
          title: localizeText(lang, lesson?.title_ar, lesson?.title_en, ""),
          subject_id: lesson?.subject?.id || "",
          subject_name: localizeSubjectName(lang, lesson?.subject || null),
          snippet: buildSnippet(text, queryText),
        };
      });

    const sources = [...lessonSources, ...questionSources].slice(0, limit);

    return {
      success: true,
      data: {
        query: queryText,
        total_sources: sources.length,
        sources,
        summary: localizeText(
          lang,
          sources.length > 0 ? `وجدت ${sources.length} مراجع مرتبطة بالسؤال.` : "لا توجد مراجع قريبة لهذا السؤال.",
          sources.length > 0 ? `Found ${sources.length} related lesson references.` : "No close lesson references found.",
          ""
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get lesson context",
    };
  }
}

// Suggest a personalized learning path
export async function suggestLearningPath(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const subjectId = params.subject_id as string | undefined;
    const goal = params.goal as string | undefined;
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en");

    if (subjectsError) throw subjectsError;

    // Get student's homework performance by subject
    const { data: homeworkPerformance } = await supabase
      .from("homework_submissions")
      .select(`
        score,
        assignment:homework_assignments (
          subject_id,
          total_points
        )
      `)
      .eq("student_id", studentContext.id)
      .eq("status", "graded");

    // Calculate average scores by subject
    const subjectScores: Record<string, { total: number; count: number; average: number }> = {};
    homeworkPerformance?.forEach((sub) => {
      const assignment = sub.assignment as unknown as { subject_id: string; total_points: number } | null;
      if (assignment?.subject_id && sub.score !== null) {
        if (!subjectScores[assignment.subject_id]) {
          subjectScores[assignment.subject_id] = { total: 0, count: 0, average: 0 };
        }
        const percentage = (sub.score / assignment.total_points) * 100;
        subjectScores[assignment.subject_id].total += percentage;
        subjectScores[assignment.subject_id].count += 1;
        subjectScores[assignment.subject_id].average =
          subjectScores[assignment.subject_id].total / subjectScores[assignment.subject_id].count;
      }
    });

    // Get student's lesson progress
    const { data: lessonProgress } = await supabase
      .from("lesson_progress")
      .select(`
        lesson_id,
        completed,
        lesson:lessons (
          id,
          title_ar,
          title_en,
          subject_id,
          grade_level,
          display_order
        )
      `)
      .eq("student_id", studentContext.id);

    // Build progress map by subject
    const progressBySubject: Record<string, { completed: number; total: number; lastLesson: number }> = {};
    lessonProgress?.forEach((p) => {
      const lesson = p.lesson as unknown as { subject_id: string; display_order: number } | null;
      if (lesson?.subject_id) {
        if (!progressBySubject[lesson.subject_id]) {
          progressBySubject[lesson.subject_id] = { completed: 0, total: 0, lastLesson: 0 };
        }
        progressBySubject[lesson.subject_id].total += 1;
        if (p.completed) {
          progressBySubject[lesson.subject_id].completed += 1;
          progressBySubject[lesson.subject_id].lastLesson = Math.max(
            progressBySubject[lesson.subject_id].lastLesson,
            lesson.display_order
          );
        }
      }
    });

    // Get uncompleted lessons
    let uncompletedQuery = supabase
      .from("lessons")
      .select(`
        id,
        title_ar,
        title_en,
        grade_level,
        display_order,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `)
      .eq("is_published", true)
      .order("grade_level", { ascending: true })
      .order("display_order", { ascending: true });

    if (studentContext.grade_level) {
      uncompletedQuery = uncompletedQuery.lte("grade_level", studentContext.grade_level);
    }

    if (subjectId) {
      uncompletedQuery = uncompletedQuery.eq("subject_id", subjectId);
    }

    const { data: allLessons } = await uncompletedQuery;

    const completedLessonIds = new Set(
      lessonProgress?.filter((p) => p.completed).map((p) => p.lesson_id) || []
    );

    const uncompletedLessons = allLessons?.filter((l) => !completedLessonIds.has(l.id)) || [];

    // Identify weak subjects (avg score < 70)
    const weakSubjects = Object.entries(subjectScores)
      .filter(([, data]) => data.average < 70)
      .map(([subjectId, data]) => {
        const subject = subjects?.find((s) => s.id === subjectId);
        return {
          subject_id: subjectId,
          subject_name_ar: subject?.name_ar,
          subject_name_en: subject?.name_en,
          average_score: Math.round(data.average),
        };
      })
      .sort((a, b) => a.average_score - b.average_score);

    // Build recommended path
    const recommendations: Array<{
      lesson_id: string;
      title_ar: string;
      title_en: string;
      subject_id: string;
      subject_name_ar: string;
      subject_name_en: string;
      grade_level: number;
      reason: string;
    }> = [];

    // Priority 1: Lessons from weak subjects
    weakSubjects.forEach((weak) => {
      const weakLessons = uncompletedLessons.filter((l) => {
        const subject = l.subject as unknown as { id: string } | null;
        return subject?.id === weak.subject_id;
      });
      weakLessons.slice(0, 2).forEach((lesson) => {
        const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;
        recommendations.push({
          lesson_id: lesson.id,
          title_ar: lesson.title_ar,
          title_en: lesson.title_en || "",
          subject_id: subject?.id || "",
          subject_name_ar: subject?.name_ar || "",
          subject_name_en: subject?.name_en || "",
          grade_level: lesson.grade_level,
          reason: localizeText(
            lang,
            `تحتاج إلى تدريب في ${subject?.name_ar || subject?.name_en || "هذه المادة"} (المتوسط الحالي: ${weak.average_score}٪)`,
            `Practice needed in ${subject?.name_en || subject?.name_ar || "this subject"} (current avg: ${weak.average_score}%)`,
            ""
          ),
        });
      });
    });

    // Priority 2: Continue from where they left off in each subject
    const remainingLessons = uncompletedLessons.filter(
      (l) => !recommendations.find((r) => r.lesson_id === l.id)
    );

    remainingLessons.slice(0, 5 - recommendations.length).forEach((lesson) => {
      const subject = lesson.subject as unknown as { id: string; name_ar: string; name_en: string } | null;
      recommendations.push({
        lesson_id: lesson.id,
        title_ar: lesson.title_ar,
        title_en: lesson.title_en || "",
        subject_id: subject?.id || "",
        subject_name_ar: subject?.name_ar || "",
        subject_name_en: subject?.name_en || "",
        grade_level: lesson.grade_level,
        reason: localizeText(lang, "تابع رحلة التعلم", "Continue your learning journey", ""),
      });
    });

    return {
      success: true,
      data: {
        recommended_lessons: recommendations,
        weak_subjects: weakSubjects,
        goal: goal || localizeText(lang, "تحسين عام في التعلم", "General learning improvement", ""),
        total_uncompleted: uncompletedLessons.length,
        summary:
          weakSubjects.length > 0
            ? localizeText(
                lang,
                `ركّز على ${weakSubjects.map((s) => s.subject_name_ar || s.subject_name_en).join(", ")} لتحسين درجاتك`,
                `Focus on ${weakSubjects.map((s) => s.subject_name_en || s.subject_name_ar).join(", ")} to improve your scores`,
                ""
              )
            : localizeText(lang, "تقدم رائع! استمر في الدروس الجديدة", "Great progress! Keep working through new lessons", ""),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to suggest learning path",
    };
  }
}

// Insight-related AI tools

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolExecutionResult, StudentContext } from "../types";
import { getPreferredLanguage, localizeSubjectName, localizeText } from "./utils";

type SubjectSummary = {
  subject_id: string;
  subject_name_ar?: string | null;
  subject_name_en?: string | null;
  subject_name?: string | null;
  average_score: number | null;
  graded_count: number;
  pending_count: number;
};

type QuestionTypeSummary = {
  question_type: string;
  total: number;
  incorrect: number;
  incorrect_rate: number;
  high_attempt_rate: number;
};

export async function getMistakePatterns(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const subjectId = params.subject_id as string | undefined;
    const limit = Math.max(3, Math.min(10, Number(params.limit ?? 5)));
    const lang = getPreferredLanguage(studentContext.preferred_language);

    const { data: submissions, error: submissionsError } = await supabase
      .from("homework_submissions")
      .select(
        `
        status,
        score,
        assignment:homework_assignments (
          subject_id,
          total_points,
          subject:subjects (
            name_ar,
            name_en
          )
        )
      `
      )
      .eq("student_id", studentContext.id);

    if (submissionsError) throw submissionsError;

    const subjectStats: Record<string, {
      subject: { name_ar?: string | null; name_en?: string | null } | null;
      totalScore: number;
      gradedCount: number;
      pendingCount: number;
    }> = {};

    (submissions || []).forEach((sub) => {
      const assignment = sub.assignment as unknown as {
        subject_id: string | null;
        total_points: number | null;
        subject: { name_ar?: string | null; name_en?: string | null } | null;
      } | null;

      if (!assignment?.subject_id) return;
      if (subjectId && assignment.subject_id !== subjectId) return;

      if (!subjectStats[assignment.subject_id]) {
        subjectStats[assignment.subject_id] = {
          subject: assignment.subject,
          totalScore: 0,
          gradedCount: 0,
          pendingCount: 0,
        };
      }

      if (sub.status === "graded" && sub.score !== null && assignment.total_points) {
        const percentage = Math.round((sub.score / assignment.total_points) * 100);
        subjectStats[assignment.subject_id].totalScore += percentage;
        subjectStats[assignment.subject_id].gradedCount += 1;
      } else if (sub.status === "not_started" || sub.status === "in_progress") {
        subjectStats[assignment.subject_id].pendingCount += 1;
      }
    });

    const subjectSummary: SubjectSummary[] = Object.entries(subjectStats).map(([id, stats]) => ({
      subject_id: id,
      subject_name_ar: stats.subject?.name_ar || null,
      subject_name_en: stats.subject?.name_en || null,
      subject_name: localizeSubjectName(lang, stats.subject || null),
      average_score: stats.gradedCount > 0 ? Math.round(stats.totalScore / stats.gradedCount) : null,
      graded_count: stats.gradedCount,
      pending_count: stats.pendingCount,
    }));

    subjectSummary.sort((a, b) => {
      const aScore = a.average_score ?? 101;
      const bScore = b.average_score ?? 101;
      return aScore - bScore;
    });

    const { data: responses, error: responsesError } = await supabase
      .from("lesson_question_responses")
      .select(
        `
        is_correct,
        attempts,
        question:lesson_questions (
          question_type,
          lesson:lessons (
            subject_id,
            subject:subjects (
              name_ar,
              name_en
            )
          )
        )
      `
      )
      .eq("student_id", studentContext.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (responsesError) throw responsesError;

    const questionTypeStats: Record<string, { total: number; incorrect: number; highAttempts: number }> = {};

    (responses || []).forEach((response) => {
      const question = response.question as unknown as {
        question_type?: string | null;
        lesson?: { subject_id?: string | null };
      } | null;
      if (!question?.question_type) return;
      if (!questionTypeStats[question.question_type]) {
        questionTypeStats[question.question_type] = { total: 0, incorrect: 0, highAttempts: 0 };
      }
      const stats = questionTypeStats[question.question_type];
      stats.total += 1;
      if (!response.is_correct) stats.incorrect += 1;
      if ((response.attempts || 0) >= 3) stats.highAttempts += 1;
    });

    const questionTypeSummary: QuestionTypeSummary[] = Object.entries(questionTypeStats).map(([type, stats]) => ({
      question_type: type,
      total: stats.total,
      incorrect: stats.incorrect,
      incorrect_rate: stats.total > 0 ? Math.round((stats.incorrect / stats.total) * 100) : 0,
      high_attempt_rate: stats.total > 0 ? Math.round((stats.highAttempts / stats.total) * 100) : 0,
    }));

    questionTypeSummary.sort((a, b) => b.incorrect_rate - a.incorrect_rate);

    const topSubject = subjectSummary[0];
    const topQuestionType = questionTypeSummary[0];

    const summary =
      subjectSummary.length === 0 && questionTypeSummary.length === 0
        ? localizeText(
            lang,
            "لا توجد بيانات كافية بعد لتحديد نقاط الضعف.",
            "Not enough data yet to find weak spots.",
            ""
          )
        : localizeText(
            lang,
            topSubject?.subject_name
              ? `أكثر مادة تحتاج تدريب: ${topSubject.subject_name}`
              : "يوجد بعض النقاط التي تحتاج تدريب إضافي.",
            topSubject?.subject_name
              ? `Most practice needed in: ${topSubject.subject_name}`
              : "There are a few areas that need more practice.",
            ""
          );

    const insights = [
      topSubject?.subject_name
        ? localizeText(
            lang,
            `ركز أكثر على ${topSubject.subject_name} هذا الأسبوع.`,
            `Focus a bit more on ${topSubject.subject_name} this week.`,
            ""
          )
        : null,
      topQuestionType?.question_type
        ? localizeText(
            lang,
            `أنواع أسئلة صعبة عليك: ${topQuestionType.question_type}.`,
            `Trickiest question type: ${topQuestionType.question_type}.`,
            ""
          )
        : null,
    ].filter(Boolean);

    return {
      success: true,
      data: {
        subject_summary: subjectSummary.slice(0, limit),
        question_type_summary: questionTypeSummary.slice(0, limit),
        summary,
        insights,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get mistake patterns",
    };
  }
}

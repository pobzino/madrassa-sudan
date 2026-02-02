// Student-related AI tools

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolExecutionResult, StudentContext, StudentProgress } from "../types";
import { getPreferredLanguage, localizeText, localizeSubjectName } from "./utils";

// Get all available subjects with their IDs
export async function getSubjects(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const lang = getPreferredLanguage(studentContext.preferred_language);

    const { data: subjects, error } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en, description, icon, display_order")
      .order("display_order", { ascending: true });

    if (error) throw error;

    const formattedSubjects = subjects?.map(s => ({
      id: s.id,
      name_ar: s.name_ar,
      name_en: s.name_en,
      name: localizeSubjectName(lang, s),
      description: s.description,
      icon: s.icon,
    })) || [];

    return {
      success: true,
      data: {
        subjects: formattedSubjects,
        count: formattedSubjects.length,
        hint: lang === "ar"
          ? "استخدم الـ id عند إنشاء الواجبات"
          : "Use the 'id' field when creating homework assignments",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get subjects",
    };
  }
}

// Get student profile information
export async function getStudentProfile(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get full profile with cohort memberships
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        grade_level,
        preferred_language,
        avatar_url,
        created_at
      `)
      .eq("id", studentContext.id)
      .single();

    if (profileError) throw profileError;

    // Get cohort memberships
    const { data: cohorts, error: cohortsError } = await supabase
      .from("cohort_students")
      .select(`
        cohort:cohorts (
          id,
          name,
          grade_level
        )
      `)
      .eq("student_id", studentContext.id)
      .eq("is_active", true);

    if (cohortsError) throw cohortsError;

    const displayName = profile?.full_name || localizeText(lang, "طالب", "Student", "Student");
    const gradeLabel = profile?.grade_level
      ? localizeText(lang, `الصف ${profile.grade_level}`, `Grade ${profile.grade_level}`, `Grade ${profile.grade_level}`)
      : localizeText(lang, "غير معروف", "Unknown", "Unknown");

    return {
      success: true,
      data: {
        ...profile,
        cohorts: cohorts?.map((c) => c.cohort) || [],
        display: {
          name: displayName,
          grade_label: gradeLabel,
          preferred_language: lang,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get student profile",
    };
  }
}

// Get student's learning progress
export async function getStudentProgress(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const subjectId = params.subject_id as string | undefined;

    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get lesson progress
    let lessonQuery = supabase
      .from("lesson_progress")
      .select("lesson_id, completed, questions_correct, questions_answered")
      .eq("student_id", studentContext.id);

    if (subjectId) {
      // Filter by subject through lessons
      const { data: subjectLessons } = await supabase
        .from("lessons")
        .select("id")
        .eq("subject_id", subjectId);

      if (subjectLessons) {
        lessonQuery = lessonQuery.in("lesson_id", subjectLessons.map(l => l.id));
      }
    }

    const { data: lessonProgress, error: lessonError } = await lessonQuery;
    if (lessonError) throw lessonError;

    // Get homework submissions
    let homeworkQuery = supabase
      .from("homework_submissions")
      .select(`
        status,
        score,
        assignment:homework_assignments (
          total_points,
          subject_id
        )
      `)
      .eq("student_id", studentContext.id);

    const { data: homeworkSubmissions, error: homeworkError } = await homeworkQuery;
    if (homeworkError) throw homeworkError;

    // Get streak data
    const { data: streak, error: streakError } = await supabase
      .from("student_streaks")
      .select("current_streak_days, longest_streak_days, total_lessons_completed, total_homework_completed")
      .eq("student_id", studentContext.id)
      .single();

    // Calculate statistics
    const lessonsCompleted = lessonProgress?.filter(l => l.completed).length || 0;
    const totalLessons = lessonProgress?.length || 0;

    const gradedHomework = homeworkSubmissions?.filter(h => h.status === "graded") || [];
    const homeworkCompleted = gradedHomework.length;
    const homeworkPending = homeworkSubmissions?.filter(h =>
      h.status === "not_started" || h.status === "in_progress"
    ).length || 0;

    // Calculate average score
    let averageScore: number | null = null;
    if (gradedHomework.length > 0) {
      const totalScore = gradedHomework.reduce((sum, h) => {
        const score = h.score || 0;
        const total = (h.assignment as unknown as { total_points: number })?.total_points || 100;
        return sum + (score / total) * 100;
      }, 0);
      averageScore = Math.round(totalScore / gradedHomework.length);
    }

    const progress: StudentProgress = {
      lessons_completed: lessonsCompleted,
      total_lessons: totalLessons,
      homework_completed: homeworkCompleted,
      homework_pending: homeworkPending,
      average_score: averageScore,
      current_streak: streak?.current_streak_days || 0,
      longest_streak: streak?.longest_streak_days || 0,
      weak_subjects: [], // Will be populated by getWeakAreas
    };

    return {
      success: true,
      data: {
        ...progress,
        summary: localizeText(
          lang,
          `أنجزت ${lessonsCompleted} من ${totalLessons} درسًا، ولديك ${homeworkPending} واجبات قيد الانتظار.`,
          `You completed ${lessonsCompleted} of ${totalLessons} lessons, with ${homeworkPending} homework pending.`,
          ""
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get student progress",
    };
  }
}

// Analyze student's weak areas
export async function getWeakAreas(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en");

    if (subjectsError) throw subjectsError;

    // Get homework scores by subject
    const { data: submissions, error: submissionsError } = await supabase
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

    if (submissionsError) throw submissionsError;

    // Calculate average score per subject
    const subjectScores: Record<string, { total: number; count: number }> = {};

    submissions?.forEach((sub) => {
      const assignment = sub.assignment as unknown as { subject_id: string; total_points: number } | null;
      if (assignment?.subject_id && sub.score !== null) {
        if (!subjectScores[assignment.subject_id]) {
          subjectScores[assignment.subject_id] = { total: 0, count: 0 };
        }
        const percentage = (sub.score / assignment.total_points) * 100;
        subjectScores[assignment.subject_id].total += percentage;
        subjectScores[assignment.subject_id].count += 1;
      }
    });

    // Find weak subjects (average < 70%)
    const weakSubjects = subjects
      ?.map((subject) => {
        const scores = subjectScores[subject.id];
        if (!scores || scores.count === 0) return null;
        const average = scores.total / scores.count;
        if (average < 70) {
          return {
            subject_id: subject.id,
            subject_name_ar: subject.name_ar,
            subject_name_en: subject.name_en,
            average_score: Math.round(average),
            homework_count: scores.count,
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => (a?.average_score || 0) - (b?.average_score || 0));

    // Also check lesson question performance
    const { data: questionResponses, error: responsesError } = await supabase
      .from("lesson_question_responses")
      .select(`
        is_correct,
        question:lesson_questions (
          lesson:lessons (
            subject_id
          )
        )
      `)
      .eq("student_id", studentContext.id);

    if (responsesError) throw responsesError;

    // Calculate question accuracy by subject
    const questionAccuracy: Record<string, { correct: number; total: number }> = {};

    questionResponses?.forEach((resp) => {
      const subjectId = (resp.question as unknown as { lesson: { subject_id: string } })?.lesson?.subject_id;
      if (subjectId) {
        if (!questionAccuracy[subjectId]) {
          questionAccuracy[subjectId] = { correct: 0, total: 0 };
        }
        questionAccuracy[subjectId].total += 1;
        if (resp.is_correct) {
          questionAccuracy[subjectId].correct += 1;
        }
      }
    });

    // Combine into weak areas analysis
    const analysis = {
      weak_subjects: weakSubjects || [],
      question_accuracy_by_subject: Object.entries(questionAccuracy).map(([subjectId, data]) => {
        const subject = subjects?.find(s => s.id === subjectId);
        return {
          subject_id: subjectId,
          subject_name_ar: subject?.name_ar,
          subject_name_en: subject?.name_en,
          subject_name: localizeText(lang, subject?.name_ar, subject?.name_en, ""),
          accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : null,
          questions_attempted: data.total,
        };
      }),
      recommendations: weakSubjects && weakSubjects.length > 0
        ? localizeText(
            lang,
            `تحتاج إلى تدريب إضافي في: ${weakSubjects.map(s => s?.subject_name_ar || s?.subject_name_en).join(", ")}`,
            `Student needs practice in: ${weakSubjects.map(s => s?.subject_name_en || s?.subject_name_ar).join(", ")}`,
            ""
          )
        : localizeText(lang, "أداؤك جيد في جميع المواد.", "Student is performing well across all subjects", ""),
    };

    return {
      success: true,
      data: analysis,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze weak areas",
    };
  }
}

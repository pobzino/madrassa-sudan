import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readAnswerFromTaskResponse } from "@/lib/lesson-activities";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

type TeacherReviewStatus = "pending_review" | "accepted" | "needs_retry";

type StudentBreakdown = {
  student_id: string;
  student_name: string | null;
  status: "correct" | "incorrect" | "completed" | "skipped" | "timed_out";
  score: number;
  time_spent_seconds: number;
  attempts: number;
  completed_at: string;
  response_id?: string;
  answer_text?: string | null;
  review_status?: TeacherReviewStatus | null;
  review_feedback?: string | null;
  reviewed_at?: string | null;
};

type QuizAggregate = {
  question_id: string;
  label: string;
  kind: "quiz_question";
  prompt_ar: string;
  prompt_en: string;
  total_responses: number;
  correct_count: number;
  avg_score: number;
  avg_time_seconds: number;
  students: StudentBreakdown[];
};

type ActivityAggregate = {
  task_id: string;
  label: string;
  kind: "activity";
  task_type: string;
  title_ar: string;
  title_en: string;
  required: boolean;
  total_responses: number;
  completed_count: number;
  skipped_count: number;
  timed_out_count: number;
  review_pending_count: number;
  accepted_count: number;
  needs_retry_count: number;
  avg_score: number;
  avg_time_seconds: number;
  model_answer_ar: string;
  model_answer_en: string;
  students: StudentBreakdown[];
};

type SlideAggregate = {
  slide_id: string;
  label: string;
  kind: "legacy_slide";
  interaction_type: string;
  title_ar: string;
  title_en: string;
  total_responses: number;
  correct_count: number;
  avg_score: number;
  avg_time_seconds: number;
  students: StudentBreakdown[];
};

function average(total: number, count: number) {
  return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
}

function toResponsePayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readFreeResponseAnswer(responseData: unknown) {
  const answer = readAnswerFromTaskResponse(toResponsePayload(responseData));

  if (typeof answer === "string") {
    return answer.trim() || null;
  }

  if (typeof answer === "number" || typeof answer === "boolean") {
    return String(answer);
  }

  if (Array.isArray(answer)) {
    const values = answer.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return values.length > 0 ? values.join(", ") : null;
  }

  return null;
}

function readTeacherReview(responseData: unknown) {
  const payload = toResponsePayload(responseData);
  const review = toResponsePayload(payload.teacher_review);
  const rawStatus = review.status;
  const status: TeacherReviewStatus | null =
    rawStatus === "accepted" || rawStatus === "needs_retry" || rawStatus === "pending_review"
      ? rawStatus
      : null;

  return {
    status,
    feedback: typeof review.feedback === "string" ? review.feedback : null,
    reviewed_at: typeof review.reviewed_at === "string" ? review.reviewed_at : null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getTeacherRole(supabase, user.id);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, created_by")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  const [
    questionDefsResult,
    questionResponsesResult,
    activityDefsResult,
    activityResponsesResult,
    slideDeckResult,
    slideResponsesResult,
  ] = await Promise.all([
    service
      .from("lesson_questions")
      .select("id, question_type, question_text_ar, question_text_en")
      .eq("lesson_id", lessonId)
      .order("timestamp_seconds", { ascending: true }),
    service
      .from("lesson_question_responses")
      .select("question_id, student_id, is_correct, attempts, updated_at")
      .in(
        "question_id",
        (
          await service
            .from("lesson_questions")
            .select("id")
            .eq("lesson_id", lessonId)
        ).data?.map((question) => question.id) || []
      ),
    service
      .from("lesson_tasks")
      .select("id, task_type, title_ar, title_en, required, task_data")
      .eq("lesson_id", lessonId)
      .order("timestamp_seconds", { ascending: true }),
    service
      .from("lesson_task_responses")
      .select("id, task_id, student_id, status, completion_score, time_spent_seconds, attempts, updated_at, response_data")
      .in(
        "task_id",
        (
          await service
            .from("lesson_tasks")
            .select("id")
            .eq("lesson_id", lessonId)
        ).data?.map((task) => task.id) || []
      ),
    service
      .from("lesson_slides")
      .select("slides")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    service
      .from("lesson_slide_responses")
      .select("slide_id, student_id, interaction_type, is_correct, completion_score, time_spent_seconds, attempts, completed_at")
      .eq("lesson_id", lessonId)
      .order("completed_at", { ascending: false }),
  ]);

  if (questionDefsResult.error || questionResponsesResult.error || activityDefsResult.error || activityResponsesResult.error || slideDeckResult.error || slideResponsesResult.error) {
    return NextResponse.json(
      {
        error:
          questionDefsResult.error?.message ||
          questionResponsesResult.error?.message ||
          activityDefsResult.error?.message ||
          activityResponsesResult.error?.message ||
          slideDeckResult.error?.message ||
          slideResponsesResult.error?.message ||
          "Failed to load results",
      },
      { status: 500 }
    );
  }

  const slideDeck = (Array.isArray(slideDeckResult.data?.slides) ? slideDeckResult.data?.slides : []) as Array<{
    id?: string;
    title_ar?: string;
    title_en?: string;
  }>;
  const slideMeta = new Map(
    slideDeck.map((slide) => [
      slide.id,
      {
        title_ar: slide.title_ar || "",
        title_en: slide.title_en || "",
      },
    ])
  );

  const studentIds = Array.from(
    new Set([
      ...(questionResponsesResult.data || []).map((response) => response.student_id),
      ...(activityResponsesResult.data || []).map((response) => response.student_id),
      ...(slideResponsesResult.data || []).map((response) => response.student_id),
    ])
  );

  const { data: students } = studentIds.length
    ? await service
        .from("profiles")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };

  const studentMap = new Map((students || []).map((student) => [student.id, student.full_name]));

  const quizzes: QuizAggregate[] = (questionDefsResult.data || []).map((question, index) => {
    const responses = (questionResponsesResult.data || []).filter((response) => response.question_id === question.id);
    const totalCorrect = responses.filter((response) => response.is_correct).length;

    return {
      question_id: question.id,
      label: `Q${index + 1}`,
      kind: "quiz_question",
      prompt_ar: question.question_text_ar,
      prompt_en: question.question_text_en || "",
      total_responses: responses.length,
      correct_count: totalCorrect,
      avg_score: average(totalCorrect, responses.length),
      avg_time_seconds: 0,
      students: responses.map((response) => ({
        student_id: response.student_id,
        student_name: studentMap.get(response.student_id) || null,
        status: response.is_correct ? "correct" : "incorrect",
        score: response.is_correct ? 1 : 0,
        time_spent_seconds: 0,
        attempts: response.attempts || 1,
        completed_at: response.updated_at,
      })),
    };
  });

  const activities: ActivityAggregate[] = (activityDefsResult.data || []).map((task, index) => {
    const responses = (activityResponsesResult.data || []).filter((response) => response.task_id === task.id);
    const completedCount = responses.filter((response) => response.status === "completed").length;
    const skippedCount = responses.filter((response) => response.status === "skipped").length;
    const timedOutCount = responses.filter((response) => response.status === "timed_out").length;
    const totalScore = responses.reduce((sum, response) => sum + (response.completion_score || 0), 0);
    const totalTime = responses.reduce((sum, response) => sum + (response.time_spent_seconds || 0), 0);
    const taskData = (task.task_data && typeof task.task_data === "object" && !Array.isArray(task.task_data)
      ? (task.task_data as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const modelAnswerAr =
      task.task_type === "free_response" && typeof taskData.expected_answer_ar === "string"
        ? (taskData.expected_answer_ar as string)
        : "";
    const modelAnswerEn =
      task.task_type === "free_response" && typeof taskData.expected_answer_en === "string"
        ? (taskData.expected_answer_en as string)
        : "";
    const students = responses.map((response) => {
      const review = readTeacherReview(response.response_data);
      const isFreeResponse = task.task_type === "free_response";
      const reviewStatus =
        isFreeResponse && response.status === "completed"
          ? review.status || "pending_review"
          : null;

      return {
        student_id: response.student_id,
        student_name: studentMap.get(response.student_id) || null,
        status:
          response.status === "skipped" || response.status === "timed_out"
            ? response.status
            : "completed",
        score: response.completion_score || 0,
        time_spent_seconds: response.time_spent_seconds || 0,
        attempts: response.attempts || 1,
        completed_at: response.updated_at,
        response_id: response.id,
        answer_text: isFreeResponse ? readFreeResponseAnswer(response.response_data) : null,
        review_status: reviewStatus,
        review_feedback: review.feedback,
        reviewed_at: review.reviewed_at,
      } satisfies StudentBreakdown;
    });
    const reviewPendingCount = students.filter((student) => student.review_status === "pending_review").length;
    const acceptedCount = students.filter((student) => student.review_status === "accepted").length;
    const needsRetryCount = students.filter((student) => student.review_status === "needs_retry").length;

    return {
      task_id: task.id,
      label: `A${index + 1}`,
      kind: "activity",
      task_type: task.task_type,
      title_ar: task.title_ar,
      title_en: task.title_en || "",
      required: task.required !== false,
      total_responses: responses.length,
      completed_count: completedCount,
      skipped_count: skippedCount,
      timed_out_count: timedOutCount,
      review_pending_count: reviewPendingCount,
      accepted_count: acceptedCount,
      needs_retry_count: needsRetryCount,
      avg_score: average(totalScore, responses.length),
      avg_time_seconds: average(totalTime, responses.length),
      model_answer_ar: modelAnswerAr,
      model_answer_en: modelAnswerEn,
      students,
    };
  });

  const legacySlides: SlideAggregate[] = Object.values(
    (slideResponsesResult.data || []).reduce<Record<string, SlideAggregate>>((acc, response) => {
      if (!acc[response.slide_id]) {
        const meta = slideMeta.get(response.slide_id) || { title_ar: "", title_en: "" };
        acc[response.slide_id] = {
          slide_id: response.slide_id,
          label: `S${Object.keys(acc).length + 1}`,
          kind: "legacy_slide",
          interaction_type: response.interaction_type,
          title_ar: meta.title_ar,
          title_en: meta.title_en,
          total_responses: 0,
          correct_count: 0,
          avg_score: 0,
          avg_time_seconds: 0,
          students: [],
        };
      }

      const stat = acc[response.slide_id];
      stat.total_responses += 1;
      if (response.is_correct) {
        stat.correct_count += 1;
      }
      stat.avg_score += response.completion_score || 0;
      stat.avg_time_seconds += response.time_spent_seconds || 0;
      stat.students.push({
        student_id: response.student_id,
        student_name: studentMap.get(response.student_id) || null,
        status: response.is_correct ? "correct" : "incorrect",
        score: response.completion_score || 0,
        time_spent_seconds: response.time_spent_seconds || 0,
        attempts: response.attempts || 1,
        completed_at: response.completed_at,
      });

      return acc;
    }, {})
  ).map((slide) => ({
    ...slide,
    avg_score: average(slide.avg_score, slide.total_responses),
    avg_time_seconds: average(slide.avg_time_seconds, slide.total_responses),
  }));

  const totalQuizResponses = quizzes.reduce((sum, quiz) => sum + quiz.total_responses, 0);
  const totalQuizCorrect = quizzes.reduce((sum, quiz) => sum + quiz.correct_count, 0);
  const totalActivityResponses = activities.reduce((sum, activity) => sum + activity.total_responses, 0);
  const totalActivityCompleted = activities.reduce((sum, activity) => sum + activity.completed_count, 0);
  const totalActivitySkipped = activities.reduce((sum, activity) => sum + activity.skipped_count, 0);
  const totalActivityScore = activities.reduce(
    (sum, activity) => sum + activity.avg_score * activity.total_responses,
    0
  );
  const totalActivityTime = activities.reduce(
    (sum, activity) => sum + activity.avg_time_seconds * activity.total_responses,
    0
  );

  return NextResponse.json({
    summary: {
      unique_students: studentIds.length,
      quiz_responses: totalQuizResponses,
      quiz_accuracy_percent: totalQuizResponses > 0 ? Math.round((totalQuizCorrect / totalQuizResponses) * 100) : 0,
      activity_responses: totalActivityResponses,
      activity_completion_percent:
        totalActivityResponses > 0 ? Math.round((totalActivityCompleted / totalActivityResponses) * 100) : 0,
      activity_skip_percent:
        totalActivityResponses > 0 ? Math.round((totalActivitySkipped / totalActivityResponses) * 100) : 0,
      avg_activity_score: average(totalActivityScore, totalActivityResponses),
      avg_activity_time_seconds: average(totalActivityTime, totalActivityResponses),
      legacy_slide_responses: legacySlides.reduce((sum, slide) => sum + slide.total_responses, 0),
    },
    quizzes,
    activities,
    legacySlides,
  });
}

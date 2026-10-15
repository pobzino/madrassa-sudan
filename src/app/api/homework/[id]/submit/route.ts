// MS-003: Student Homework Submission API
// POST /api/homework/[id]/submit - Submit homework answers
// PUT /api/homework/[id]/submit - Save draft answers
//
// Grading is server-side only. Reads and authorisation checks run under the
// student's own session (RLS), but every write that decides a result — the
// submitted status, responses with points_earned, score / graded status /
// graded_at, the homework_attempts log, attempt_count, the Practice lesson
// completion and the streak — goes through the service role. The database
// (migration 20261016120000_lock_down_student_grading_writes) refuses those
// writes from a student's own session, so they cannot be forged from the
// browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { submitHomeworkSchema, saveDraftSchema } from "@/lib/homework.validation";
import { getLearnerContextResult } from "@/lib/server/learner-context";
import { createOwnedLearnerAdminClient } from "@/lib/server/learner-admin";
import {
  countsAsNewHomeworkCompletion,
  gradeHomeworkAnswers,
  isOpenSubmissionStatus,
  meetsPassingScore,
  normalizeSubmittedAnswers,
  OPEN_SUBMISSION_STATUSES,
  passMarkPoints,
  type GradableQuestion,
} from "@/lib/homework-grading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function unknownQuestionsResponse(unknownQuestionIds: string[]) {
  return NextResponse.json(
    {
      error: "Some answers are for questions that are not part of this assignment",
      details: { unknown_question_ids: unknownQuestionIds },
    },
    { status: 400 }
  );
}

// POST - Submit completed homework
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: assignmentId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolved = await getLearnerContextResult(request, supabase);
    if (resolved.response) return resolved.response;
    const learnerId = resolved.context.learnerId;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = submitHomeworkSchema.safeParse({
      ...body,
      assignment_id: assignmentId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const learnerService = await createOwnedLearnerAdminClient(resolved.context);
    if (learnerService.error === "service_role_unavailable") {
      return NextResponse.json({ error: "Homework submission is temporarily unavailable" }, { status: 503 });
    }
    if (learnerService.error || !learnerService.admin) {
      return NextResponse.json({ error: "Learner is no longer available" }, { status: learnerService.error === "ownership_check_failed" ? 500 : 403 });
    }
    const admin = learnerService.admin;

    // Verify assignment exists and is published (RLS: the student must be able to see it)
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .select(`
        *,
        homework_questions(*),
        cohorts(id)
      `)
      .eq("id", assignmentId)
      .eq("is_published", true)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found or not published" }, { status: 404 });
    }

    // Practice assignments are global (cohort_id is null) — any signed-in
    // student may submit. Cohort homework still requires an active, approved
    // enrollment (a pending join request does not count).
    if (assignment.cohort_id) {
      const { data: cohortMembership } = await supabase
        .from("cohort_students")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("student_id", learnerId)
        .eq("is_active", true)
        .eq("status", "approved")
        .single();

      if (!cohortMembership) {
        return NextResponse.json(
          { error: "You are not enrolled in this class" },
          { status: 403 }
        );
      }
    }

    const questions = (assignment.homework_questions || []) as GradableQuestion[];

    // One answer per question (the last one sent wins), and only for this
    // assignment's questions — duplicates used to be scored once per copy.
    const normalized = normalizeSubmittedAnswers(data.answers, questions.map((q) => q.id));
    if (!normalized.ok) {
      return unknownQuestionsResponse(normalized.unknownQuestionIds);
    }
    const answers = normalized.answers;

    // Check if already submitted
    const { data: existingSubmission } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", learnerId)
      .maybeSingle();

    if (existingSubmission && !isOpenSubmissionStatus(existingSubmission.status)) {
      return NextResponse.json(
        { error: "You have already submitted this homework" },
        { status: 400 }
      );
    }

    // Check due date
    const now = new Date();
    const nowIso = now.toISOString();
    const dueDate = assignment.due_at ? new Date(assignment.due_at) : null;
    const isLate = dueDate && now > dueDate;

    if (isLate && !assignment.allow_late_submission) {
      return NextResponse.json(
        { error: "This assignment is past due and does not allow late submissions" },
        { status: 400 }
      );
    }

    const isPractice = !!assignment.is_practice;
    const grade = gradeHomeworkAnswers(questions, answers, isPractice);
    const { autoGradedScore, autoGradablePoints, allQuestionsAutoGradable, correctCount } = grade;
    const gradedByQuestion = new Map(grade.answers.map((g) => [g.question_id, g]));

    // Get or create submission
    let submissionId: string;
    const timeSpent = data.time_spent_seconds || existingSubmission?.time_spent_seconds || 0;

    if (existingSubmission) {
      // Only an open (not yet submitted) row may be moved to "submitted"; this
      // also stops two concurrent submits from both being graded.
      const { data: updatedRows, error: updateError } = await admin
        .from("homework_submissions")
        .update({
          status: "submitted",
          submitted_at: nowIso,
          time_spent_seconds: timeSpent,
          updated_at: nowIso,
        })
        .eq("id", existingSubmission.id)
        .eq("student_id", learnerId)
        .in("status", [...OPEN_SUBMISSION_STATUSES])
        .select("id");

      if (updateError) {
        console.error("Error updating submission:", updateError);
        return NextResponse.json(
          { error: "Failed to submit homework" },
          { status: 500 }
        );
      }
      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json(
          { error: "You have already submitted this homework" },
          { status: 400 }
        );
      }

      submissionId = existingSubmission.id;
    } else {
      // Create new submission
      const { data: newSubmission, error: insertError } = await admin
        .from("homework_submissions")
        .insert({
          assignment_id: assignmentId,
          student_id: learnerId,
          status: "submitted",
          submitted_at: nowIso,
          started_at: nowIso,
          time_spent_seconds: timeSpent,
        })
        .select()
        .single();

      if (insertError || !newSubmission) {
        console.error("Error creating submission:", insertError);
        return NextResponse.json(
          { error: "Failed to submit homework" },
          { status: 500 }
        );
      }

      submissionId = newSubmission.id;
    }

    // Replace any draft responses with the submitted answers, marked.
    const { error: deleteResponsesError } = await admin
      .from("homework_responses")
      .delete()
      .eq("submission_id", submissionId);

    if (deleteResponsesError) {
      console.error("Error clearing draft responses:", deleteResponsesError);
      return NextResponse.json(
        { error: "Failed to save answers" },
        { status: 500 }
      );
    }

    const responsesToInsert = answers.map((answer) => ({
      submission_id: submissionId,
      question_id: answer.question_id,
      response_text: answer.response_text || null,
      response_file_url: answer.response_file_url || null,
      response_file_urls: answer.response_file_urls || null,
      points_earned: gradedByQuestion.get(answer.question_id)?.pointsEarned ?? null,
    }));

    if (responsesToInsert.length > 0) {
      const { error: responsesError } = await admin
        .from("homework_responses")
        .insert(responsesToInsert);

      if (responsesError) {
        console.error("Error saving responses:", responsesError);
        return NextResponse.json(
          { error: "Failed to save answers" },
          { status: 500 }
        );
      }
    }

    // Update submission with auto-graded score. When every question can be
    // marked automatically the attempt is graded even if some (or all) were
    // left blank — they score 0 — so it never sits in "submitted" waiting for
    // a teacher and can still be retaken.
    const fullyAutoGraded = allQuestionsAutoGradable && questions.length > 0;
    if (fullyAutoGraded) {
      const { error: gradeError } = await admin
        .from("homework_submissions")
        .update({
          score: autoGradedScore,
          status: "graded",
          graded_at: nowIso,
        })
        .eq("id", submissionId)
        .eq("student_id", learnerId);
      if (gradeError) console.error("Error saving auto-graded score:", gradeError);
    } else if (autoGradablePoints > 0) {
      // Partial auto-grade, save score but keep as submitted for manual grading
      const { error: gradeError } = await admin
        .from("homework_submissions")
        .update({
          score: autoGradedScore,
        })
        .eq("id", submissionId)
        .eq("student_id", learnerId);
      if (gradeError) console.error("Error saving partial auto-graded score:", gradeError);
    }

    // Passing a Practice IS the completion of its lesson (independent track):
    // the recording alone never marks the lesson complete, so record it here so
    // dashboards, counters and the streak trigger stay in step with the path
    // tree. Below the threshold nothing is written — the student just retries.
    const passedNow = meetsPassingScore(autoGradedScore, assignment.total_points, assignment.passing_score);
    let lessonCompleted = false;
    let firstLessonCompletion = false;
    if (isPractice && assignment.lesson_id && passedNow) {
      // The service role skips RLS, so check lesson access the way the
      // student's own lesson_progress policy does: no completion (or streak
      // bump) for a lesson that is unpublished or limited to another class.
      const { data: canAccessLesson, error: lessonAccessError } = await admin.rpc(
        "can_user_access_published_lesson",
        { p_user_id: user.id, p_lesson_id: assignment.lesson_id }
      );
      if (lessonAccessError) {
        console.error("Error checking lesson access for Practice completion:", lessonAccessError);
      }

      if (canAccessLesson === true) {
        const { data: existingLessonProgress } = await supabase
          .from("lesson_progress")
          .select("completed")
          .eq("student_id", learnerId)
          .eq("lesson_id", assignment.lesson_id)
          .maybeSingle();

        if (!existingLessonProgress?.completed) {
          const { error: lessonProgressError } = await admin.from("lesson_progress").upsert(
            {
              student_id: learnerId,
              lesson_id: assignment.lesson_id,
              completed: true,
              completed_at: nowIso,
            },
            { onConflict: "student_id,lesson_id" }
          );

          if (lessonProgressError) {
            console.error("Error recording Practice lesson completion:", lessonProgressError);
          } else {
            lessonCompleted = true;
            const { count } = await supabase
              .from("lesson_progress")
              .select("id", { count: "exact", head: true })
              .eq("student_id", learnerId)
              .eq("completed", true);
            firstLessonCompletion = count === 1;
          }
        }
      }
    }

    // Snapshot this attempt into the immutable homework_attempts log so teachers
    // can see the student's full progression across retries. We record the
    // answers picked plus per-question correctness for auto-gradable questions.
    const attemptAnswers = answers.map((answer) => {
      const graded = gradedByQuestion.get(answer.question_id);
      return {
        question_id: answer.question_id,
        response_text: answer.response_text || null,
        response_file_urls: answer.response_file_urls || null,
        is_correct: graded?.isCorrect ?? null,
        points_earned: graded?.pointsEarned ?? null,
      };
    });

    const { count: priorAttempts } = await admin
      .from("homework_attempts")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId)
      .eq("student_id", learnerId);

    const attemptNumber = (priorAttempts ?? 0) + 1;

    // A Practice counts toward the homework total on its first pass, so look
    // for an earlier passing attempt (read before this one is logged).
    let passedBefore = false;
    if (isPractice && passedNow) {
      const { count: priorPasses } = await admin
        .from("homework_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId)
        .eq("student_id", learnerId)
        .gte("score", passMarkPoints(assignment.total_points ?? 0, assignment.passing_score));
      passedBefore = (priorPasses ?? 0) > 0;
    }
    const countsAsNewHomework = countsAsNewHomeworkCompletion({
      isPractice,
      // Submissions from before the attempt log only carry attempt_count.
      priorAttempts: Math.max(priorAttempts ?? 0, existingSubmission?.attempt_count ?? 0),
      passedNow,
      passedBefore,
    });

    const { error: attemptError } = await admin.from("homework_attempts").insert({
      assignment_id: assignmentId,
      student_id: learnerId,
      submission_id: submissionId,
      attempt_number: attemptNumber,
      score: fullyAutoGraded || autoGradablePoints > 0 ? autoGradedScore : null,
      max_score: assignment.total_points ?? null,
      correct_count: correctCount,
      total_questions: questions.length,
      answers: attemptAnswers,
      submitted_at: nowIso,
    });
    if (attemptError) console.error("Error logging homework attempt:", attemptError);

    // Keep attempt_count on the submission in step with the log.
    await admin
      .from("homework_submissions")
      .update({ attempt_count: attemptNumber })
      .eq("id", submissionId)
      .eq("student_id", learnerId);

    // Update student streak (every submission is activity for the day; the
    // homework total counts each assignment once, not every retake).
    const streakDays = await updateStudentStreak(admin, learnerId, countsAsNewHomework);

    return NextResponse.json({
      success: true,
      streakDays,
      data: {
        submission_id: submissionId,
        status: fullyAutoGraded ? "graded" : "submitted",
        is_late: isLate,
        auto_graded_score: autoGradedScore,
        auto_gradable_points: autoGradablePoints,
        all_questions_auto_gradable: allQuestionsAutoGradable,
        total_points: assignment.total_points ?? 0,
        correct_count: correctCount,
        total_questions: questions.length,
        attempt_number: attemptNumber,
        submitted_at: nowIso,
        lesson_completed: lessonCompleted,
        first_lesson_completion: firstLessonCompletion,
      },
      message: "Homework submitted successfully",
    });
  } catch (error) {
    console.error("Homework submission API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT - Save draft answers (autosave)
// Drafts stay on the student's own session: the database allows a student to
// write their open (not_started / in_progress) submission and its answers, but
// never points, scores or a submitted/graded status.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: assignmentId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolved = await getLearnerContextResult(request, supabase);
    if (resolved.response) return resolved.response;
    const learnerId = resolved.context.learnerId;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = saveDraftSchema.safeParse({
      ...body,
      assignment_id: assignmentId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify assignment exists and is published
    const { data: assignment } = await supabase
      .from("homework_assignments")
      .select("cohort_id, is_published, homework_questions(id)")
      .eq("id", assignmentId)
      .eq("is_published", true)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Practice assignments have no cohort; enrollment only applies otherwise.
    if (assignment.cohort_id) {
      const { data: cohortMembership } = await supabase
        .from("cohort_students")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("student_id", learnerId)
        .eq("is_active", true)
        .eq("status", "approved")
        .single();

      if (!cohortMembership) {
        return NextResponse.json(
          { error: "You are not enrolled in this class" },
          { status: 403 }
        );
      }
    }

    const questionIds = (assignment.homework_questions ?? []).map((q: { id: string }) => q.id);
    const normalized = normalizeSubmittedAnswers(data.answers, questionIds);
    if (!normalized.ok) {
      return unknownQuestionsResponse(normalized.unknownQuestionIds);
    }

    // Get or create submission
    let submissionId: string;
    const now = new Date();
    const timeSpent = data.time_spent_seconds || 0;

    const { data: existingSubmission } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", learnerId)
      .maybeSingle();

    if (existingSubmission) {
      // Don't allow saving a draft once submitted, graded or returned.
      if (!isOpenSubmissionStatus(existingSubmission.status)) {
        return NextResponse.json(
          { error: "Cannot modify submitted homework" },
          { status: 400 }
        );
      }

      submissionId = existingSubmission.id;

      // Update time spent
      await supabase
        .from("homework_submissions")
        .update({
          status: "in_progress",
          time_spent_seconds: Math.max(existingSubmission.time_spent_seconds || 0, timeSpent),
          started_at: existingSubmission.started_at || now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", submissionId);
    } else {
      // Create new submission in progress
      const { data: newSubmission, error: insertError } = await supabase
        .from("homework_submissions")
        .insert({
          assignment_id: assignmentId,
          student_id: learnerId,
          status: "in_progress",
          started_at: now.toISOString(),
          time_spent_seconds: timeSpent,
        })
        .select()
        .single();

      if (insertError || !newSubmission) {
        console.error("Error creating draft submission:", insertError);
        return NextResponse.json(
          { error: "Failed to save draft" },
          { status: 500 }
        );
      }

      submissionId = newSubmission.id;
    }

    // Upsert responses (update if exists, insert if not)
    for (const answer of normalized.answers) {
      if (!answer.response_text && !answer.response_file_url && !answer.response_file_urls) {
        continue; // Skip empty answers
      }

      const { data: existingResponse } = await supabase
        .from("homework_responses")
        .select("id")
        .eq("submission_id", submissionId)
        .eq("question_id", answer.question_id)
        .limit(1)
        .maybeSingle();

      if (existingResponse) {
        await supabase
          .from("homework_responses")
          .update({
            response_text: answer.response_text || null,
            response_file_url: answer.response_file_url || null,
            response_file_urls: answer.response_file_urls || null,
            updated_at: now.toISOString(),
          })
          .eq("id", existingResponse.id);
      } else {
        await supabase
          .from("homework_responses")
          .insert({
            submission_id: submissionId,
            question_id: answer.question_id,
            response_text: answer.response_text || null,
            response_file_url: answer.response_file_url || null,
            response_file_urls: answer.response_file_urls || null,
          });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        submission_id: submissionId,
        saved_at: now.toISOString(),
      },
      message: "Draft saved successfully",
    });
  } catch (error) {
    console.error("Homework draft API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// Helper function to update student streak — returns current streak days.
// Runs with the service role: students can only read their streak row.
// countHomework adds this assignment to total_homework_completed (see
// countsAsNewHomeworkCompletion); the day streak moves either way.
async function updateStudentStreak(
  admin: ServiceClient,
  userId: string,
  countHomework: boolean
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existingStreak } = await admin
    .from("student_streaks")
    .select("*")
    .eq("student_id", userId)
    .maybeSingle();

  if (existingStreak) {
    const lastActivity = existingStreak.last_activity_date;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let newStreak = existingStreak.current_streak_days;

    if (lastActivity === today) {
      // Already active today
    } else if (lastActivity === yesterdayStr) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    await admin
      .from("student_streaks")
      .update({
        current_streak_days: newStreak,
        longest_streak_days: Math.max(newStreak, existingStreak.longest_streak_days),
        last_activity_date: today,
        total_homework_completed: existingStreak.total_homework_completed + (countHomework ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingStreak.id)
      .eq("student_id", userId);

    return newStreak;
  } else {
    await admin.from("student_streaks").insert({
      student_id: userId,
      current_streak_days: 1,
      longest_streak_days: 1,
      last_activity_date: today,
      total_homework_completed: countHomework ? 1 : 0,
    });

    return 1;
  }
}

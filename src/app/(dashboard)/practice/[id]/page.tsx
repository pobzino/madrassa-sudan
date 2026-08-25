"use client";

// Student-facing Practice runner for a lesson's practice assignment.
// Loads the practice, hands it to PracticePlayer (owl, hearts, confetti),
// submits the attempt through the standard homework submit/retake APIs, and
// routes back into the learning path afterwards.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import PracticePlayer, {
  type PracticeAnswer,
  type PracticeQuestionInput,
} from "@/components/practice/PracticePlayer";
import { PRACTICE_PASSING_SCORE } from "@/lib/practice";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { loadLessonNavigation } from "@/lib/lessons/path-navigation";

interface LoadedPractice {
  title: string;
  passingPercent: number;
  alreadyPassed: boolean;
  hasSubmission: boolean;
  lessonId: string | null;
  subjectId: string | null;
  gradeLevel: number | null;
  attemptNumber: number;
  questions: PracticeQuestionInput[];
}

const STR = {
  ar: {
    loading: "جاري تحميل التدريب...",
    notFound: "لم نجد هذا التدريب.",
    notPractice: "هذا الواجب ليس تدريباً.",
    back: "العودة للدروس",
    error: "حدث خطأ. حاول مرة أخرى.",
  },
  en: {
    loading: "Loading practice...",
    notFound: "We couldn't find this practice.",
    notPractice: "This assignment is not a practice.",
    back: "Back to lessons",
    error: "Something went wrong. Please try again.",
  },
} as const;

const TRUE_FALSE_LABELS = {
  ar: [
    { value: "true", label: "صحيح" },
    { value: "false", label: "خطأ" },
  ],
  en: [
    { value: "true", label: "True" },
    { value: "false", label: "False" },
  ],
} as const;

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const router = useRouter();
  const { language, isRtl } = useLanguage();
  const t = STR[language];

  const supabase = useMemo(() => createClient(), []);
  const [practice, setPractice] = useState<LoadedPractice | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not_found" | "not_practice">("loading");
  const [round, setRound] = useState(0);
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  // Displayed bilingual choices map back to the canonical value stored for
  // server-side grading.
  const [submissionValueByQuestion, setSubmissionValueByQuestion] = useState<
    Record<string, Record<string, string>>
  >({});
  const loadVersionRef = useRef(0);
  const trackedStartsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current;
    setStatus("loading");
    try {
      const res = await fetch(`/api/homework/${assignmentId}`);
      if (res.status === 404 || res.status === 403) {
        setStatus("not_found");
        return;
      }
      const payload = await res.json();
      const data = payload?.data;
      if (!data) {
        setStatus("error");
        return;
      }
      if (!data.is_practice) {
        setStatus("not_practice");
        return;
      }

      let gradeLevel: number | null = null;
      if (data.lesson_id) {
        const { data: currentLesson } = await supabase
          .from("lessons")
          .select("subject_id, grade_level")
          .eq("id", data.lesson_id)
          .maybeSingle();

        gradeLevel = currentLesson?.grade_level ?? null;

        if (currentLesson?.subject_id) {
          const navigation = await loadLessonNavigation(
            supabase,
            currentLesson.subject_id,
            data.lesson_id,
          );
          setNextLessonId(navigation.next?.id ?? null);
        }
      }

      const submissionMap: Record<string, Record<string, string>> = {};
      const questions: PracticeQuestionInput[] = (data.questions ?? [])
        .filter((q: { correct_answer?: string | null }) => q.correct_answer)
        .map(
          (q: {
            id: string;
            question_type: string;
            question_text_ar: string;
            question_text_en: string | null;
            options: string[] | null;
            options_ar?: string[] | null;
            options_en?: string[] | null;
            correct_answer: string;
            correct_option_index?: number | null;
            audio_url_ar?: string | null;
            audio_url_en?: string | null;
          }) => {
            const prompt =
              (language === "ar" ? q.question_text_ar : q.question_text_en) || q.question_text_ar;
            if (q.question_type === "true_false") {
              const labels = TRUE_FALSE_LABELS[language];
              submissionMap[q.id] = Object.fromEntries(labels.map((l) => [l.label, l.value]));
              const correctIndex =
                typeof q.correct_option_index === "number"
                  ? q.correct_option_index
                  : q.correct_answer === "false" || q.correct_answer === "خطأ"
                    ? 1
                    : 0;
              return {
                id: q.id,
                type: "true_false" as const,
                prompt,
                options: labels.map((l) => l.label),
                correctAnswer: labels[correctIndex]?.label ?? labels[0].label,
                audioUrl: (language === "ar" ? q.audio_url_ar : q.audio_url_en) ?? null,
              };
            }
            if (q.question_type === "short_answer") {
              return {
                id: q.id,
                type: "short_answer" as const,
                prompt,
                options: [],
                correctAnswer: q.correct_answer,
                audioUrl: (language === "ar" ? q.audio_url_ar : q.audio_url_en) ?? null,
              };
            }
            const optionsAr = (q.options_ar?.length ? q.options_ar : q.options) ?? [];
            const optionsEn = (q.options_en?.length ? q.options_en : q.options) ?? optionsAr;
            const displayOptions = language === "ar" ? optionsAr : optionsEn;
            const correctIndex =
              typeof q.correct_option_index === "number"
                ? q.correct_option_index
                : optionsAr.findIndex((option) => option === q.correct_answer);
            submissionMap[q.id] = Object.fromEntries(
              displayOptions.map((option, optionIndex) => [option, optionsAr[optionIndex] ?? option])
            );
            return {
              id: q.id,
              type: "multiple_choice" as const,
              prompt,
              options: displayOptions,
              correctAnswer: displayOptions[correctIndex] ?? q.correct_answer,
              audioUrl: (language === "ar" ? q.audio_url_ar : q.audio_url_en) ?? null,
            };
          }
        );

      // If a graded submission exists: passed -> offer continue/replay screen;
      // failed -> reset it now so this fresh run can submit cleanly.
      let alreadyPassed = false;
      let attemptNumber = 1;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: sub } = await supabase
          .from("homework_submissions")
          .select("status, score, attempt_count")
          .eq("assignment_id", assignmentId)
          .eq("student_id", user.id)
          .maybeSingle();
        if (sub && (sub.status === "graded" || sub.status === "returned")) {
          attemptNumber = (sub.attempt_count ?? 0) + 1;
          const totalPoints = data.total_points ?? 0;
          const threshold = ((data.passing_score ?? PRACTICE_PASSING_SCORE) / 100) * totalPoints;
          if (sub.score != null && totalPoints > 0 && sub.score >= threshold) {
            alreadyPassed = true;
          } else {
            const retryResponse = await fetch(`/api/homework/${assignmentId}/retake`, { method: "POST" });
            if (retryResponse.ok) {
              trackAnalyticsEvent("practice_retry", {
                assignment_id: assignmentId,
                lesson_id: data.lesson_id || "",
                attempt_number: attemptNumber,
                source: "resume_failed_attempt",
              });
            }
          }
        } else if (sub?.attempt_count) {
          attemptNumber = sub.attempt_count + 1;
        }
      }

      if (loadVersion !== loadVersionRef.current) return;
      setSubmissionValueByQuestion(submissionMap);
      setPractice({
        title: (language === "ar" ? data.title_ar : data.title_en) || data.title_ar || "",
        passingPercent: data.passing_score ?? PRACTICE_PASSING_SCORE,
        alreadyPassed,
        hasSubmission: false,
        lessonId: data.lesson_id ?? null,
        subjectId: data.subject_id ?? null,
        gradeLevel,
        attemptNumber,
        questions,
      });
      setStatus(questions.length > 0 ? "ready" : "error");
    } catch (err) {
      console.error("Failed to load practice:", err);
      setStatus("error");
    }
  }, [assignmentId, language, supabase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (status !== "ready" || !practice || practice.alreadyPassed) return;
    const startKey = `${assignmentId}:${round}`;
    if (trackedStartsRef.current.has(startKey)) return;
    trackedStartsRef.current.add(startKey);
    trackAnalyticsEvent("practice_start", {
      assignment_id: assignmentId,
      lesson_id: practice.lessonId || "",
      subject_id: practice.subjectId || "",
      grade_level: practice.gradeLevel ?? 0,
      attempt_number: practice.attemptNumber + round,
      question_count: practice.questions.length,
    });
  }, [assignmentId, practice, round, status]);

  const handleFinish = useCallback(
    async ({ correctCount, total, answers }: { correctCount: number; total: number; answers: PracticeAnswer[] }) => {
      try {
        const res = await fetch(`/api/homework/${assignmentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: answers.map((a) => ({
              question_id: a.questionId,
              response_text:
                submissionValueByQuestion[a.questionId]?.[a.response] ?? a.response,
            })),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          trackAnalyticsEvent("media_error", {
            assignment_id: assignmentId,
            error_type: `practice_submit_${res.status}`,
            media_type: "practice_submission",
          });
          return false;
        }

        const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
        const attemptNumber = payload?.data?.attempt_number ?? practice?.attemptNumber ?? 1;
        const context = {
          assignment_id: assignmentId,
          lesson_id: practice?.lessonId || "",
          subject_id: practice?.subjectId || "",
          grade_level: practice?.gradeLevel ?? 0,
          attempt_number: attemptNumber,
          question_count: total,
          score_percent: scorePercent,
        };
        trackAnalyticsEvent("practice_submit", context);
        trackAnalyticsEvent(
          scorePercent >= (practice?.passingPercent ?? PRACTICE_PASSING_SCORE)
            ? "practice_pass"
            : "practice_fail",
          context,
        );
        return true;
      } catch (err) {
        console.error("Failed to submit practice:", err);
        trackAnalyticsEvent("media_error", {
          assignment_id: assignmentId,
          error_type: "practice_submit_network",
          media_type: "practice_submission",
        });
        return false;
      }
    },
    [assignmentId, practice, submissionValueByQuestion]
  );

  const requestQuestionAudio = useCallback(
    async (questionId: string) => {
      try {
        const response = await fetch(`/api/practice/questions/${questionId}/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language }),
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as { audio_url?: string };
        return payload.audio_url ?? null;
      } catch {
        return null;
      }
    },
    [language]
  );

  const handleRetry = useCallback(() => {
    // Reset the graded submission server-side, then remount the player.
    trackAnalyticsEvent("practice_retry", {
      assignment_id: assignmentId,
      lesson_id: practice?.lessonId || "",
      attempt_number: (practice?.attemptNumber ?? 1) + round + 1,
      source: "results_screen",
    });
    void fetch(`/api/homework/${assignmentId}/retake`, { method: "POST" }).finally(() =>
      setRound((r) => r + 1)
    );
  }, [assignmentId, practice, round]);

  const returnToLessons = useCallback(() => {
    router.push("/lessons");
    router.refresh();
  }, [router]);

  const handleContinue = useCallback(() => {
    trackAnalyticsEvent("next_lesson_open", {
      lesson_id: nextLessonId || "",
      source: "practice_complete",
    });
    router.push(nextLessonId ? `/lessons/${nextLessonId}` : "/lessons");
    router.refresh();
  }, [router, nextLessonId]);

  if (status === "loading") {
    return (
      <div dir={isRtl ? "rtl" : "ltr"} className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm font-medium text-gray-400">{t.loading}</div>
      </div>
    );
  }

  if (status !== "ready" || !practice) {
    return (
      <div dir={isRtl ? "rtl" : "ltr"} className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="text-base font-semibold text-gray-600">
          {status === "not_found" ? t.notFound : status === "not_practice" ? t.notPractice : t.error}
        </div>
        <button
          type="button"
          onClick={returnToLessons}
          className="rounded-2xl bg-[var(--primary)] px-6 py-3 font-bold text-white"
        >
          {t.back}
        </button>
      </div>
    );
  }

  if (practice.alreadyPassed && round === 0) {
    const replay = () => {
      trackAnalyticsEvent("practice_retry", {
        assignment_id: assignmentId,
        lesson_id: practice.lessonId || "",
        attempt_number: practice.attemptNumber,
        source: "replay_passed_practice",
      });
      void fetch(`/api/homework/${assignmentId}/retake`, { method: "POST" }).finally(() =>
        setPractice((p) => (p ? { ...p, alreadyPassed: false } : p))
      );
    };
    return (
      <div dir={isRtl ? "rtl" : "ltr"} className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-2xl">🎉</div>
        <div className="text-lg font-bold text-gray-800">
          {language === "ar" ? "أكملت هذا التدريب من قبل!" : "You already completed this practice!"}
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button type="button" onClick={handleContinue} className="rounded-2xl bg-[var(--primary)] py-3.5 font-bold text-white">
            {language === "ar" ? "متابعة" : "Continue"}
          </button>
          <button type="button" onClick={replay} className="rounded-2xl border-2 border-gray-200 bg-white py-3 font-bold text-gray-600">
            {language === "ar" ? "تدرب مرة أخرى" : "Practice again"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRtl ? "rtl" : "ltr"}>
      <PracticePlayer
        key={`${language}-${round}`}
        title={practice.title}
        questions={practice.questions}
        lang={language}
        passingPercent={practice.passingPercent}
        onFinish={handleFinish}
        onRetry={handleRetry}
        onContinue={handleContinue}
        onExit={returnToLessons}
        onRequestAudio={requestQuestionAudio}
        onAudioError={(reason) => {
          trackAnalyticsEvent("media_error", {
            assignment_id: assignmentId,
            error_type: reason,
            media_type: "question_audio",
            content_language: language,
          });
        }}
      />
    </div>
  );
}

"use client";

// Student-facing Practice runner for a lesson's practice assignment.
// Loads the practice, hands it to PracticePlayer (owl, hearts, confetti),
// submits the attempt through the standard homework submit/retake APIs, and
// routes back into the learning path afterwards.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import PracticePlayer, {
  type PracticeAnswer,
  type PracticeQuestionInput,
} from "@/components/practice/PracticePlayer";
import { PRACTICE_PASSING_SCORE } from "@/lib/practice";

interface LoadedPractice {
  title: string;
  passingPercent: number;
  alreadyPassed: boolean;
  hasSubmission: boolean;
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
  // True/false labels are display-localized but submit canonical "true"/"false".
  const [tfByQuestion, setTfByQuestion] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
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

      if (data.lesson_id) {
        const { data: currentLesson } = await supabase
          .from("lessons")
          .select("subject_id")
          .eq("id", data.lesson_id)
          .maybeSingle();

        if (currentLesson?.subject_id) {
          const { data: subjectLessons } = await supabase
            .from("lessons")
            .select("id")
            .eq("subject_id", currentLesson.subject_id)
            .eq("is_published", true)
            .order("display_order", { ascending: true });
          const currentIndex = subjectLessons?.findIndex((item) => item.id === data.lesson_id) ?? -1;
          setNextLessonId(
            currentIndex >= 0 ? subjectLessons?.[currentIndex + 1]?.id ?? null : null
          );
        }
      }

      const tfMap: Record<string, Record<string, string>> = {};
      const questions: PracticeQuestionInput[] = (data.questions ?? [])
        .filter((q: { correct_answer?: string | null }) => q.correct_answer)
        .map(
          (q: {
            id: string;
            question_type: string;
            question_text_ar: string;
            question_text_en: string | null;
            options: string[] | null;
            correct_answer: string;
          }) => {
            const prompt =
              (language === "ar" ? q.question_text_ar : q.question_text_en) || q.question_text_ar;
            if (q.question_type === "true_false") {
              const labels = TRUE_FALSE_LABELS[language];
              tfMap[q.id] = Object.fromEntries(labels.map((l) => [l.label, l.value]));
              const correctLabel =
                labels.find((l) => l.value === q.correct_answer)?.label ?? q.correct_answer;
              return {
                id: q.id,
                type: "true_false" as const,
                prompt,
                options: labels.map((l) => l.label),
                correctAnswer: correctLabel,
              };
            }
            if (q.question_type === "short_answer") {
              return {
                id: q.id,
                type: "short_answer" as const,
                prompt,
                options: [],
                correctAnswer: q.correct_answer,
              };
            }
            return {
              id: q.id,
              type: "multiple_choice" as const,
              prompt,
              options: (q.options ?? []) as string[],
              correctAnswer: q.correct_answer,
            };
          }
        );

      // If a graded submission exists: passed -> offer continue/replay screen;
      // failed -> reset it now so this fresh run can submit cleanly.
      let alreadyPassed = false;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: sub } = await supabase
          .from("homework_submissions")
          .select("status, score")
          .eq("assignment_id", assignmentId)
          .eq("student_id", user.id)
          .maybeSingle();
        if (sub && (sub.status === "graded" || sub.status === "returned")) {
          const totalPoints = data.total_points ?? 0;
          const threshold = ((data.passing_score ?? PRACTICE_PASSING_SCORE) / 100) * totalPoints;
          if (sub.score != null && totalPoints > 0 && sub.score >= threshold) {
            alreadyPassed = true;
          } else {
            await fetch(`/api/homework/${assignmentId}/retake`, { method: "POST" });
          }
        }
      }

      setTfByQuestion(tfMap);
      setPractice({
        title: (language === "ar" ? data.title_ar : data.title_en) || data.title_ar || "",
        passingPercent: data.passing_score ?? PRACTICE_PASSING_SCORE,
        alreadyPassed,
        hasSubmission: false,
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

  const handleFinish = useCallback(
    async ({ answers }: { correctCount: number; total: number; answers: PracticeAnswer[] }) => {
      try {
        const res = await fetch(`/api/homework/${assignmentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: answers.map((a) => ({
              question_id: a.questionId,
              // Map localized true/false labels back to canonical values.
              response_text: tfByQuestion[a.questionId]?.[a.response] ?? a.response,
            })),
          }),
        });
        return res.ok;
      } catch (err) {
        console.error("Failed to submit practice:", err);
        return false;
      }
    },
    [assignmentId, tfByQuestion]
  );

  const handleRetry = useCallback(() => {
    // Reset the graded submission server-side, then remount the player.
    void fetch(`/api/homework/${assignmentId}/retake`, { method: "POST" }).finally(() =>
      setRound((r) => r + 1)
    );
  }, [assignmentId]);

  const returnToLessons = useCallback(() => {
    router.push("/lessons");
    router.refresh();
  }, [router]);

  const handleContinue = useCallback(() => {
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
        key={round}
        title={practice.title}
        questions={practice.questions}
        lang={language}
        passingPercent={practice.passingPercent}
        onFinish={handleFinish}
        onRetry={handleRetry}
        onContinue={handleContinue}
        onExit={returnToLessons}
      />
    </div>
  );
}

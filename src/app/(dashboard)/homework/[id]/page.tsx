"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlCelebrating, OwlEncouraging, OwlCorrect, OwlPointing, Confetti } from "@/components/illustrations";
import type { HomeworkAssignment, HomeworkQuestion, HomeworkSubmission, HomeworkResponse, Subject } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { toast } from "sonner";
import {
  getHomeworkFileName,
  HOMEWORK_BUCKET,
  isImageFile,
  isRemoteFileUrl,
  normalizeHomeworkFileRefs,
} from "@/lib/homework-files";
import { useActivitySounds } from "@/hooks/useActivitySounds";
import HomeworkOwlCompanion, { type OwlMood } from "@/components/homework/HomeworkOwlCompanion";
import HomeworkProgressBar from "@/components/homework/HomeworkProgressBar";
import HomeworkCompletionCard from "@/components/homework/HomeworkCompletionCard";

const translations = {
  ar: {
    loading: "جاري التحميل...",
    notFound: "الواجب غير موجود",
    backToHomework: "العودة للواجبات",
    question: "سؤال",
    of: "من",
    points: "نقطة",
    required: "مطلوب",
    optional: "اختياري",
    typeAnswer: "اكتب إجابتك هنا...",
    selectOption: "اختر إجابة",
    submit: "إرسال الواجب",
    submitting: "جاري الإرسال...",
    submitted: "تم الإرسال",
    submittedDesc: "لقد أرسلت هذا الواجب بنجاح",
    graded: "تم التصحيح",
    score: "الدرجة",
    feedback: "ملاحظات المعلم",
    correct: "صحيح",
    incorrect: "خطأ",
    yourAnswer: "إجابتك",
    correctAnswer: "الإجابة الصحيحة",
    teacherComment: "تعليق المعلم",
    dueAt: "موعد التسليم",
    overdue: "متأخر",
    saving: "جاري الحفظ...",
    saved: "تم الحفظ",
    prev: "السابق",
    next: "التالي",
    confirmSubmit: "هل أنت متأكد من إرسال الواجب؟",
    confirmSubmitDesc: "لن تتمكن من تعديل إجاباتك بعد الإرسال",
    cancel: "إلغاء",
    yes: "نعم، أرسل",
    trueLabel: "صح",
    falseLabel: "خطأ",
    uploadFiles: "رفع ملفات",
    uploadedFiles: "الملفات المرفوعة",
    uploadHelp: "ارفع صورًا أو ملفات PDF أو مستندات",
    uploading: "جاري رفع الملف...",
    removeFile: "حذف الملف",
    uploadFailed: "فشل رفع الملف",
    askOwlHint: "اسأل البومة",
    hintCost: "تلميح (−1 نقطة)",
    noMoreHints: "لا مزيد من التلميحات",
    muteSound: "كتم الصوت",
    unmuteSound: "تشغيل الصوت",
  },
  en: {
    loading: "Loading...",
    notFound: "Homework not found",
    backToHomework: "Back to Homework",
    question: "Question",
    of: "of",
    points: "points",
    required: "Required",
    optional: "Optional",
    typeAnswer: "Type your answer here...",
    selectOption: "Select an answer",
    submit: "Submit Homework",
    submitting: "Submitting...",
    submitted: "Submitted",
    submittedDesc: "You have successfully submitted this homework",
    graded: "Graded",
    score: "Score",
    feedback: "Teacher Feedback",
    correct: "Correct",
    incorrect: "Incorrect",
    yourAnswer: "Your answer",
    correctAnswer: "Correct answer",
    teacherComment: "Teacher comment",
    dueAt: "Due",
    overdue: "Overdue",
    saving: "Saving...",
    saved: "Saved",
    prev: "Previous",
    next: "Next",
    confirmSubmit: "Submit this homework?",
    confirmSubmitDesc: "You won't be able to edit your answers after submission",
    cancel: "Cancel",
    yes: "Yes, Submit",
    trueLabel: "True",
    falseLabel: "False",
    uploadFiles: "Upload Files",
    uploadedFiles: "Uploaded Files",
    uploadHelp: "Upload images, PDFs, or documents",
    uploading: "Uploading file...",
    removeFile: "Remove file",
    uploadFailed: "File upload failed",
    askOwlHint: "Ask Owl",
    hintCost: "Hint (−1 point)",
    noMoreHints: "No more hints",
    muteSound: "Mute sounds",
    unmuteSound: "Unmute sounds",
  },
};

const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  x: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  star: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  chevronLeft: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
};

type ResponseMap = { [questionId: string]: string };
type FileAnswerMap = Record<string, string[]>;
type FileDisplayMap = Record<string, { ref: string; url: string; name: string }[]>;

export default function HomeworkAssignmentPage() {
  const params = useParams();
  const assignmentId = params.id as string;
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);
  const [responses, setResponses] = useState<HomeworkResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<ResponseMap>({});
  const [fileAnswers, setFileAnswers] = useState<FileAnswerMap>({});
  const [fileDisplays, setFileDisplays] = useState<FileDisplayMap>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [uploadingQuestionId, setUploadingQuestionId] = useState<string | null>(null);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const answersRef = useRef<ResponseMap>({});
  const fileAnswersRef = useRef<FileAnswerMap>({});

  // Engagement features
  const { playCorrect, playIncorrect, playComplete, playTap } = useActivitySounds();
  const [owlMood, setOwlMood] = useState<OwlMood>('thinking');
  const [showCompletionCard, setShowCompletionCard] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [soundMuted, setSoundMuted] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<string, number>>({});
  const [instantFeedback, setInstantFeedback] = useState<Record<string, 'correct' | 'incorrect'>>({});

  // Initialize mute from localStorage
  useEffect(() => {
    setSoundMuted(localStorage.getItem('activity-sounds-muted') === '1');
  }, []);

  const toggleMute = useCallback(() => {
    setSoundMuted(prev => {
      const next = !prev;
      localStorage.setItem('activity-sounds-muted', next ? '1' : '0');
      return next;
    });
  }, []);

  // Reset owl mood to thinking after excitement fades
  useEffect(() => {
    if (owlMood !== 'thinking' && owlMood !== 'idle') {
      const submitted = submission?.status === 'submitted' || submission?.status === 'graded' || submission?.status === 'returned';
      if (!submitted) {
        const timer = setTimeout(() => setOwlMood('thinking'), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [owlMood, submission?.status]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    fileAnswersRef.current = fileAnswers;
  }, [fileAnswers]);

  const buildFileDisplays = useCallback(async (fileRefs: string[]) => {
    const entries = await Promise.all(
      fileRefs.map(async (fileRef) => {
        if (isRemoteFileUrl(fileRef)) {
          return {
            ref: fileRef,
            url: fileRef,
            name: getHomeworkFileName(fileRef),
          };
        }

        const { data, error } = await supabase.storage
          .from(HOMEWORK_BUCKET)
          .createSignedUrl(fileRef, 60 * 60);

        if (error || !data?.signedUrl) {
          return null;
        }

        return {
          ref: fileRef,
          url: data.signedUrl,
          name: getHomeworkFileName(fileRef),
        };
      })
    );

    return entries.filter(
      (entry): entry is { ref: string; url: string; name: string } => entry !== null
    );
  }, [supabase]);

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserId(user.id);

      // Fetch assignment
      const { data: assignmentData } = await supabase
        .from("homework_assignments")
        .select("*")
        .eq("id", assignmentId)
        .single();

      if (!assignmentData) {
        setLoading(false);
        return;
      }
      setAssignment(assignmentData);

      // Fetch subject
      if (assignmentData.subject_id) {
        const { data: subjectData } = await supabase
          .from("subjects")
          .select("*")
          .eq("id", assignmentData.subject_id)
          .single();
        if (subjectData) setSubject(subjectData);
      }

      // Fetch questions
      const { data: questionsData } = await supabase
        .from("homework_questions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("display_order");
      if (questionsData) setQuestions(questionsData);

      // Fetch existing submission
      const { data: submissionData } = await supabase
        .from("homework_submissions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("student_id", user.id)
        .single();

      if (submissionData) {
        setSubmission(submissionData);

        // Fetch responses
        const { data: responsesData } = await supabase
          .from("homework_responses")
          .select("*")
          .eq("submission_id", submissionData.id);

        if (responsesData) {
          setResponses(responsesData);
          // Populate answers from existing responses
          const answerMap: ResponseMap = {};
          const nextFileAnswers: FileAnswerMap = {};
          responsesData.forEach((r) => {
            answerMap[r.question_id] = r.response_text || "";
            const fileRefs = normalizeHomeworkFileRefs(r.response_file_urls, r.response_file_url);
            if (fileRefs.length > 0) {
              nextFileAnswers[r.question_id] = fileRefs;
            }
          });
          setAnswers(answerMap);
          setFileAnswers(nextFileAnswers);

          const displayEntries = await Promise.all(
            Object.entries(nextFileAnswers).map(async ([questionId, fileRefs]) => [
              questionId,
              await buildFileDisplays(fileRefs),
            ] as const)
          );
          setFileDisplays(Object.fromEntries(displayEntries));
        }
      }

      setLoading(false);
    }
    loadData();
  }, [assignmentId, buildFileDisplays, router, supabase]);

  const saveDraftAnswer = useCallback(async (questionId: string) => {
    if (!assignmentId) return;

    setSaving(true);

    try {
      await fetch(`/api/homework/${assignmentId}/submit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: [{
            question_id: questionId,
            response_text: answersRef.current[questionId] || null,
            response_file_urls: fileAnswersRef.current[questionId] || null,
          }],
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [assignmentId]);

  const scheduleDraftSave = useCallback((questionId: string) => {
    const existingTimer = saveTimersRef.current[questionId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    saveTimersRef.current[questionId] = setTimeout(() => {
      void saveDraftAnswer(questionId);
    }, 800);
  }, [saveDraftAnswer]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    answersRef.current = { ...answersRef.current, [questionId]: value };
    playTap();
    setOwlMood('excited');

    // Instant feedback for auto-gradable types
    if (assignment?.show_instant_feedback) {
      const q = questions.find(qq => qq.id === questionId);
      if (q && (q.question_type === 'multiple_choice' || q.question_type === 'true_false') && q.correct_answer) {
        if (value === q.correct_answer) {
          setInstantFeedback(prev => ({ ...prev, [questionId]: 'correct' }));
          setOwlMood('correct');
          playCorrect();
        } else {
          setInstantFeedback(prev => ({ ...prev, [questionId]: 'incorrect' }));
          setOwlMood('wrong');
          playIncorrect();
        }
      }
    }

    scheduleDraftSave(questionId);
  };

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleFileUpload = useCallback(async (questionId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !userId) {
      return;
    }

    setUploadingQuestionId(questionId);

    try {
      const uploadedRefs: string[] = [];

      for (const file of Array.from(files)) {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const filePath = `${userId}/${assignmentId}/${questionId}/${Date.now()}-${crypto.randomUUID()}-${sanitizedName}`;

        const { error } = await supabase.storage.from(HOMEWORK_BUCKET).upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        });

        if (error) {
          throw error;
        }

        uploadedRefs.push(filePath);
      }

      const nextRefs = [...(fileAnswersRef.current[questionId] || []), ...uploadedRefs];
      const nextFileAnswers = { ...fileAnswersRef.current, [questionId]: nextRefs };
      fileAnswersRef.current = nextFileAnswers;
      setFileAnswers(nextFileAnswers);
      const nextDisplays = await buildFileDisplays(nextRefs);
      setFileDisplays((prev) => ({ ...prev, [questionId]: nextDisplays }));

      await saveDraftAnswer(questionId);
    } catch (error) {
      console.error("Homework file upload failed:", error);
      toast.error(t.uploadFailed);
    } finally {
      setUploadingQuestionId(null);
    }
  }, [assignmentId, buildFileDisplays, saveDraftAnswer, supabase.storage, t.uploadFailed, userId]);

  const handleRemoveFile = useCallback(async (questionId: string, fileRef: string) => {
    if (!isRemoteFileUrl(fileRef)) {
      const { error } = await supabase.storage.from(HOMEWORK_BUCKET).remove([fileRef]);
      if (error) {
        console.error("Failed to remove homework file:", error);
      }
    }

    const nextRefs = (fileAnswersRef.current[questionId] || []).filter((value) => value !== fileRef);
    const nextFileAnswers = { ...fileAnswersRef.current, [questionId]: nextRefs };
    fileAnswersRef.current = nextFileAnswers;
    setFileAnswers(nextFileAnswers);
    setFileDisplays((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] || []).filter((entry) => entry.ref !== fileRef),
    }));

    await saveDraftAnswer(questionId);
  }, [saveDraftAnswer, supabase.storage]);

  // Submit homework
  const handleSubmit = async () => {
    setSubmitting(true);
    setShowConfirm(false);

    try {
      const payload = questions.map((question) => ({
        question_id: question.id,
        response_text: answersRef.current[question.id] || null,
        response_file_urls: fileAnswersRef.current[question.id] || null,
      }));

      const response = await fetch(`/api/homework/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit homework");
      }

      const result = await response.json();
      if (result.streakDays) setStreakDays(result.streakDays);

      if (userId) {
        const { data: submissionData } = await supabase
          .from("homework_submissions")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId)
          .single();

        if (submissionData) {
          setSubmission(submissionData);

          const { data: responsesData } = await supabase
            .from("homework_responses")
            .select("*")
            .eq("submission_id", submissionData.id);

          if (responsesData) {
            setResponses(responsesData);
          }
        }
      }

      playComplete();
      setOwlMood('celebrating');
      setShowCompletionCard(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } catch (error) {
      console.error("Homework submission failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  // Check if overdue
  const isOverdue = assignment?.due_at ? new Date(assignment.due_at) < new Date() : false;

  // Get response for question (for graded view)
  const getResponse = (questionId: string) => {
    return responses.find((r) => r.question_id === questionId);
  };

  const isSubmitted = submission?.status === "submitted" || submission?.status === "graded" || submission?.status === "returned";
  const isGraded = submission?.status === "graded" || submission?.status === "returned";
  const currentQ = questions[currentQuestion];
  const currentResponse = currentQ ? getResponse(currentQ.id) : undefined;
  const currentFileDisplays = currentQ ? fileDisplays[currentQ.id] || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br bg-[#007229] flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 animate-bounce shadow-lg">
            م
          </div>
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-4">{t.notFound}</p>
          <Link
            href="/homework"
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            {t.backToHomework}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Celebration confetti */}
      {showConfetti && <Confetti />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 lg:top-0 z-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <Link
                href="/homework"
                className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0"
              >
                <span className={isRtl ? "rotate-180 inline-block" : ""}>{Icons.back}</span>
              </Link>
              <div className="min-w-0">
                <h1 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                  {language === "ar" ? assignment.title_ar : assignment.title_en || assignment.title_ar}
                </h1>
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500">
                  {subject && <span className="truncate">{language === "ar" ? subject.name_ar : subject.name_en}</span>}
                  {assignment.due_at && (
                    <>
                      <span>•</span>
                      <span className={`flex items-center gap-0.5 sm:gap-1 whitespace-nowrap ${isOverdue && !isSubmitted ? "text-red-600" : ""}`}>
                        {Icons.clock}
                        <span className="hidden sm:inline">{isOverdue && !isSubmitted ? t.overdue : t.dueAt}</span> {formatDate(assignment.due_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Mute toggle */}
            {!isSubmitted && (
              <button
                onClick={toggleMute}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
                title={soundMuted ? t.unmuteSound : t.muteSound}
              >
                {soundMuted ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-3.72a.75.75 0 011.28.53v14.88a.75.75 0 01-1.28.53l-4.72-3.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-3.72a.75.75 0 011.28.53v14.88a.75.75 0 01-1.28.53l-4.72-3.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                )}
              </button>
            )}

            {/* Status/Score */}
            {isGraded && submission?.score !== null && (
              <div className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-emerald-100 text-[#007229] rounded-xl text-sm sm:text-base">
                {Icons.star}
                <span className="font-bold">{submission.score}/{assignment.total_points}</span>
              </div>
            )}
            {isSubmitted && !isGraded && (
              <div className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-emerald-100 text-[#007229] rounded-xl text-sm sm:text-base">
                <OwlCelebrating className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="font-medium hidden sm:inline">{t.submitted}</span>
              </div>
            )}
            {saving && (
              <span className="text-xs sm:text-sm text-gray-400">{t.saving}</span>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Teacher feedback (if graded) */}
        {isGraded && submission?.feedback && (
          <div className="bg-[#007229]/10 border border-emerald-200 rounded-2xl p-3.5 sm:p-5 mb-4 sm:mb-6">
            <h3 className="font-semibold text-emerald-800 mb-1.5 sm:mb-2 text-sm sm:text-base">{t.feedback}</h3>
            <p className="text-[#007229] text-sm sm:text-base">{submission.feedback}</p>
          </div>
        )}

        {/* Progress bar with walking owl */}
        <HomeworkProgressBar
          total={questions.length}
          answered={Object.keys(answers).filter(k => answers[k]?.trim() || fileAnswers[k]?.length).length}
          current={currentQuestion}
          onSelect={setCurrentQuestion}
          questionStatuses={questions.map((q) => {
            const response = getResponse(q.id);
            if (isGraded && response) {
              return response.points_earned != null && response.points_earned > 0 ? 'correct' : 'incorrect';
            }
            const hasAnswer = Boolean(answers[q.id]?.trim() || fileAnswers[q.id]?.length);
            return hasAnswer ? 'answered' : 'unanswered';
          })}
        />

        {/* Question card */}
        {currentQ && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Question header */}
            <div className="px-3.5 py-3 sm:p-5 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-semibold font-fredoka text-gray-500">
                  {t.question} {currentQuestion + 1} {t.of} {questions.length}
                </span>
                <span className="text-sm sm:text-base font-semibold font-fredoka text-[#007229]">
                  {currentQ.points} {t.points}
                </span>
              </div>
            </div>

            {/* Question content */}
            <div className="p-3.5 sm:p-6">
              <p className="text-lg sm:text-xl font-semibold font-fredoka text-gray-900 mb-3 sm:mb-4">
                {language === "ar" ? currentQ.question_text_ar : currentQ.question_text_en || currentQ.question_text_ar}
              </p>

              {/* Hints */}
              {!isSubmitted && Array.isArray(currentQ.hints) && (currentQ.hints as string[]).length > 0 && (
                <div className="mb-3 sm:mb-4">
                  {Array.from({ length: revealedHints[currentQ.id] || 0 }, (_, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 p-2.5 sm:p-3 bg-amber-50 rounded-xl animate-pop-in">
                      <OwlPointing className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-amber-800 font-medium">{(currentQ.hints as string[])[i]}</p>
                    </div>
                  ))}
                  {(revealedHints[currentQ.id] || 0) < (currentQ.hints as string[]).length ? (
                    <button
                      onClick={() => {
                        setRevealedHints(prev => ({
                          ...prev,
                          [currentQ.id]: (prev[currentQ.id] || 0) + 1,
                        }));
                        setOwlMood('pointing');
                      }}
                      className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-semibold font-fredoka transition-colors"
                    >
                      <span>💡</span>
                      {(revealedHints[currentQ.id] || 0) === 0 ? t.askOwlHint : t.hintCost}
                    </button>
                  ) : (revealedHints[currentQ.id] || 0) > 0 ? (
                    <p className="text-xs text-gray-400 mt-1">{t.noMoreHints}</p>
                  ) : null}
                </div>
              )}

              {/* Answer input based on type */}
              {currentQ.question_type === "multiple_choice" && currentQ.options && (
                <div className="space-y-2 sm:space-y-3">
                  {(currentQ.options as string[]).map((option, idx) => {
                    const isSelected = answers[currentQ.id] === option;
                    const isCorrectOption = isGraded && option === currentQ.correct_answer;
                    const isWrongSelection = isGraded && isSelected && option !== currentQ.correct_answer;

                    return (
                      <button
                        key={idx}
                        onClick={() => !isSubmitted && handleAnswerChange(currentQ.id, option)}
                        disabled={isSubmitted}
                        className={`w-full p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                          isGraded
                            ? isCorrectOption
                              ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                              : isWrongSelection
                                ? "bg-red-100 border-red-500 text-red-800"
                                : "bg-gray-50 border-gray-200 text-gray-600"
                            : isSelected
                              ? "bg-[#007229]/10 border-emerald-500 shadow-sm"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        } ${isSubmitted ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-sm sm:text-base font-fredoka ${
                            isGraded
                              ? isCorrectOption
                                ? "border-emerald-500 bg-[#007229]/100 text-white"
                                : isWrongSelection
                                  ? "border-red-500 bg-red-500 text-white"
                                  : "border-gray-300"
                              : isSelected
                                ? "border-emerald-500 bg-[#007229]/100 text-white"
                                : "border-gray-300"
                          }`}>
                            {isGraded && isCorrectOption && Icons.check}
                            {isGraded && isWrongSelection && Icons.x}
                          </span>
                          <span className="text-sm sm:text-base font-medium">{option}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQ.question_type === "true_false" && (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  {[
                    { value: "true", label: t.trueLabel },
                    { value: "false", label: t.falseLabel },
                  ].map((option) => {
                    const isSelected = answers[currentQ.id] === option.value;
                    const isCorrectOption = isGraded && option.value === currentQ.correct_answer;
                    const isWrongSelection = isGraded && isSelected && option.value !== currentQ.correct_answer;

                    return (
                      <button
                        key={option.value}
                        onClick={() => !isSubmitted && handleAnswerChange(currentQ.id, option.value)}
                        disabled={isSubmitted}
                        className={`w-full p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 text-center transition-all active:scale-[0.97] ${
                          isGraded
                            ? isCorrectOption
                              ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                              : isWrongSelection
                                ? "bg-red-100 border-red-500 text-red-800"
                                : "bg-gray-50 border-gray-200 text-gray-600"
                            : isSelected
                              ? "bg-[#007229]/10 border-emerald-500 shadow-sm"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        } ${isSubmitted ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <span className="text-base sm:text-lg font-bold font-fredoka">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Instant feedback (when show_instant_feedback enabled) */}
              {!isGraded && instantFeedback[currentQ.id] && (
                <div className={`mt-3 p-3 rounded-xl animate-pop-in flex items-center gap-2 ${
                  instantFeedback[currentQ.id] === 'correct'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {instantFeedback[currentQ.id] === 'correct' ? (
                    <>
                      <OwlCorrect className="w-8 h-8 flex-shrink-0" />
                      <span className="font-semibold font-fredoka">{t.correct}</span>
                    </>
                  ) : (
                    <>
                      <OwlEncouraging className="w-8 h-8 flex-shrink-0" />
                      <span className="font-semibold font-fredoka">{t.incorrect}</span>
                    </>
                  )}
                </div>
              )}

              {currentQ.question_type === "short_answer" && (
                <div>
                  <input
                    type="text"
                    value={answers[currentQ.id] || ""}
                    onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                    disabled={isSubmitted}
                    placeholder={t.typeAnswer}
                    className="w-full px-3.5 sm:px-5 py-3 sm:py-4 bg-gray-50 border-2 border-gray-200 rounded-xl sm:rounded-2xl text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  {isGraded && currentQ.correct_answer && (
                    <div className="mt-3 p-3 bg-[#007229]/10 rounded-xl">
                      <p className="text-sm text-[#007229]">
                        <span className="font-medium">{t.correctAnswer}:</span> {currentQ.correct_answer}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {currentQ.question_type === "long_answer" && (
                <div>
                  <textarea
                    value={answers[currentQ.id] || ""}
                    onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                    disabled={isSubmitted}
                    placeholder={t.typeAnswer}
                    rows={5}
                    className="w-full px-3.5 sm:px-5 py-3 sm:py-4 bg-gray-50 border-2 border-gray-200 rounded-xl sm:rounded-2xl text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {currentQ.question_type === "file_upload" && (
                <div className="space-y-4">
                  {currentQ.instructions && (
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">
                      {currentQ.instructions}
                    </p>
                  )}

                  {!isSubmitted && (
                    <label className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 sm:px-6 py-5 sm:py-8 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer active:bg-emerald-50">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx"
                        onChange={(event) => void handleFileUpload(currentQ.id, event.target.files)}
                      />
                      <span className="font-medium text-gray-800 text-sm sm:text-base">{t.uploadFiles}</span>
                      <span className="text-xs sm:text-sm text-gray-500">{t.uploadHelp}</span>
                    </label>
                  )}

                  {uploadingQuestionId === currentQ.id && (
                    <p className="text-sm text-gray-500">{t.uploading}</p>
                  )}

                  {currentFileDisplays.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">{t.uploadedFiles}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {currentFileDisplays.map((file) => (
                          <div
                            key={file.ref}
                            className="rounded-xl border border-gray-200 bg-white p-3"
                          >
                            {isImageFile(file.url) ? (
                              <img
                                src={file.url}
                                alt={file.name}
                                className="mb-3 h-40 w-full rounded-lg object-cover"
                              />
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-sm font-medium text-cyan-700 hover:text-cyan-800"
                              >
                                {file.name}
                              </a>
                              {!isSubmitted && (
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveFile(currentQ.id, file.ref)}
                                  className="text-sm text-red-600 hover:text-red-700"
                                >
                                  {t.removeFile}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Owl celebration for graded answers */}
              {isGraded && currentResponse && (
                <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-3">
                  {currentResponse.points_earned != null && currentResponse.points_earned > 0 ? (
                    <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-emerald-50 rounded-xl sm:rounded-2xl animate-pop-in">
                      <OwlCorrect className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" />
                      <span className="text-sm sm:text-base font-semibold font-fredoka text-emerald-700">{t.correct}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-amber-50 rounded-xl sm:rounded-2xl animate-pop-in">
                      <OwlEncouraging className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" />
                      <span className="text-sm sm:text-base font-semibold font-fredoka text-amber-700">{t.incorrect}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Teacher comment on this question */}
              {isGraded && currentResponse?.teacher_comment && (
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl sm:rounded-2xl">
                  <p className="text-sm sm:text-base font-semibold text-amber-800 mb-1">{t.teacherComment}</p>
                  <p className="text-sm sm:text-base text-amber-700">{currentResponse.teacher_comment}</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="px-3.5 py-3 sm:p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestion === 0}
                className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-gray-600 hover:bg-gray-200 rounded-xl text-sm sm:text-base font-semibold font-fredoka disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-gray-200"
              >
                {isRtl ? Icons.chevronRight : Icons.chevronLeft}
                <span>{t.prev}</span>
              </button>

              <button
                onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))}
                disabled={currentQuestion === questions.length - 1}
                className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-gray-600 hover:bg-gray-200 rounded-xl text-sm sm:text-base font-semibold font-fredoka disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-gray-200"
              >
                <span>{t.next}</span>
                {isRtl ? Icons.chevronLeft : Icons.chevronRight}
              </button>
            </div>
          </div>
        )}

        {/* Submit button */}
        {!isSubmitted && questions.length > 0 && (
          <div className="mt-4 sm:mt-6 pb-20 sm:pb-0">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="w-full py-3.5 sm:py-4 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg shadow-[#007229]/30 text-sm sm:text-base active:bg-emerald-700"
            >
              {submitting ? t.submitting : t.submit}
            </button>
          </div>
        )}
      </div>

      {/* Owl companion (floating) - hidden on very small screens to avoid overlap */}
      {!isSubmitted && (
        <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-30 hidden min-[400px]:block">
          <HomeworkOwlCompanion mood={owlMood} language={language} />
        </div>
      )}

      {/* Completion card */}
      {showCompletionCard && (
        <HomeworkCompletionCard
          language={language}
          totalQuestions={questions.length}
          answeredQuestions={Object.keys(answers).filter(k => answers[k]?.trim() || fileAnswers[k]?.length).length}
          totalPoints={assignment.total_points}
          score={isGraded ? submission?.score : undefined}
          streakDays={streakDays}
          isGraded={isGraded}
          onClose={() => setShowCompletionCard(false)}
        />
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.confirmSubmit}</h3>
            <p className="text-gray-500 mb-6">{t.confirmSubmitDesc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                {t.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import BunnyVideoUploader from "@/components/teacher/BunnyVideoUploader";
import VideoPreview from "@/components/teacher/VideoPreview";
import AIContentGenerator from "@/components/teacher/AIContentGenerator";
import TaskEditor, { type TaskForm } from "@/components/teacher/TaskEditor";
import {
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
  getSupportedSubjectKey,
  hasMappedCurriculum,
  serializeCurriculumSelection,
  type CurriculumSelection,
} from "@/lib/curriculum";
import type { Database } from "@/lib/database.types";
import InteractionResultsPanel from "@/components/teacher/InteractionResultsPanel";
import SlideEditor from "@/components/slides/SlideEditor";
import SlideGenerateButton from "@/components/slides/SlideGenerateButton";
import type { Slide } from "@/lib/slides.types";
import {
  clampSlideCount,
  DEFAULT_SLIDE_LENGTH_PRESET,
  getSlideGenerationContextStorageKey,
  getSlideLengthPresetConfig,
  getSlideLengthPresetFromCount,
  parseSlideGenerationContext,
  SLIDE_LENGTH_PRESET_OPTIONS,
  TEACHER_GRADE_OPTIONS,
  type SlideGenerationContext,
  type SlideLengthPreset,
  type SlideLanguageMode,
} from "@/lib/slides-generation";

type Subject = {
  id: string;
  name_ar: string;
  name_en: string;
};

type CohortOption = {
  id: string;
  name: string;
  grade_level: number;
  is_active: boolean;
};

type LessonForm = {
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  subject_id: string;
  grade_level: number;
  curriculum_topic: CurriculumSelection | null;
  is_published: boolean;
  thumbnail_url: string;
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  captions_ar_url: string;
  captions_en_url: string;
  video_duration_seconds: string;
};

type QuestionForm = {
  id: string;
  question_type: "multiple_choice" | "true_false" | "fill_in_blank";
  question_text_ar: string;
  question_text_en: string;
  options: string[];
  correct_answer: string;
  points: number;
  timestamp_seconds: number;
  is_required: boolean;
  allow_retry: boolean;
};

type ContentBlock = {
  id?: string;
  language: "ar" | "en";
  content: string;
  source_type: string;
  sequence: number;
};

type Tab = "details" | "questions" | "slides" | "content" | "results";

type LessonVideoUrls = {
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  duration_seconds?: number;
};

function applyVideoUrlsToForm(previous: LessonForm, urls: LessonVideoUrls): LessonForm {
  return {
    ...previous,
    video_url_1080p: urls.video_url_1080p,
    video_url_360p: urls.video_url_360p,
    video_url_480p: urls.video_url_480p,
    video_url_720p: urls.video_url_720p,
    ...(urls.duration_seconds != null
      ? { video_duration_seconds: String(urls.duration_seconds) }
      : {}),
  };
}

export default function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading: authLoading } = useTeacherGuard();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [availableCohorts, setAvailableCohorts] = useState<CohortOption[]>([]);
  const [assignedCohortIds, setAssignedCohortIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [videoInputMode, setVideoInputMode] = useState<"upload" | "manual">("upload");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideSaving, setSlideSaving] = useState(false);
  const [slideLastSaved, setSlideLastSaved] = useState<string | null>(null);
  const [slideGenContext, setSlideGenContext] = useState<SlideGenerationContext | null>(null);
  const [slideCount, setSlideCount] = useState(
    getSlideLengthPresetConfig(DEFAULT_SLIDE_LENGTH_PRESET).slideCount
  );
  const [slideLengthPreset, setSlideLengthPreset] = useState<SlideLengthPreset>(
    DEFAULT_SLIDE_LENGTH_PRESET
  );
  const [slideLanguageMode, setSlideLanguageMode] = useState<SlideLanguageMode>("ar");
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [slideGenProgress, setSlideGenProgress] = useState("");

  const [form, setForm] = useState<LessonForm>({
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    subject_id: "",
    grade_level: 1,
    curriculum_topic: null,
    is_published: false,
    thumbnail_url: "",
    video_url_1080p: "",
    video_url_360p: "",
    video_url_480p: "",
    video_url_720p: "",
    captions_ar_url: "",
    captions_en_url: "",
    video_duration_seconds: "",
  });

  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [lessonTasks, setLessonTasks] = useState<TaskForm[]>([]);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);

  const persistLessonVideoUrls = useCallback(
    async (urls: LessonVideoUrls, successText = "Video saved") => {
      const supabase = createClient();
      const { error } = await supabase
        .from("lessons")
        .update({
          video_url_1080p: urls.video_url_1080p,
          video_url_360p: urls.video_url_360p,
          video_url_480p: urls.video_url_480p,
          video_url_720p: urls.video_url_720p,
          ...(urls.duration_seconds != null
            ? { video_duration_seconds: urls.duration_seconds }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }

      setSaveMessage({ type: "success", text: successText });
      setTimeout(() => setSaveMessage(null), 2000);
    },
    [id]
  );

  const loadLesson = useCallback(async () => {
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const [{ data: subjectRows }, { data: profile }] = await Promise.all([
      supabase
        .from("subjects")
        .select("id, name_ar, name_en")
        .order("display_order"),
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single(),
    ]);
    const supportedSubjects = (subjectRows || []).filter((subject) =>
      Boolean(getSupportedSubjectKey(subject))
    );
    setSubjects(supportedSubjects);

    const cohortQuery =
      profile?.role === "admin"
        ? supabase
            .from("cohorts")
            .select("id, name, grade_level, is_active")
            .order("name")
        : supabase
            .from("cohort_teachers")
            .select(`
              cohort_id,
              cohorts (
                id,
                name,
                grade_level,
                is_active
              )
            `)
            .eq("teacher_id", user.id);

    const [{ data: lesson }, cohortResult, { data: existingAssignments }, slidesRes] = await Promise.all([
      supabase
        .from("lessons")
        .select("*")
        .eq("id", id)
        .single(),
      cohortQuery,
      supabase
        .from("cohort_lessons")
        .select("cohort_id")
        .eq("lesson_id", id)
        .eq("is_active", true),
      fetch(`/api/teacher/lessons/${id}/slides`).then((r) => r.json()).catch(() => null),
    ]);

    if (slidesRes?.slideDeck?.slides) {
      setSlides(slidesRes.slideDeck.slides);
    }
    if (slidesRes?.slideDeck?.language_mode === "en") {
      setSlideLanguageMode("en");
    } else if (
      slidesRes?.slideDeck?.language_mode === "ar" ||
      slidesRes?.slideDeck?.language_mode === "both"
    ) {
      setSlideLanguageMode("ar");
    }

    const cohortRows =
      profile?.role === "admin"
        ? ((cohortResult as { data?: CohortOption[] | null })?.data || [])
        : (((cohortResult as {
            data?: Array<{
              cohort_id: string;
              cohorts: CohortOption | CohortOption[] | null;
            }> | null;
          })?.data || [])
            .map((row) =>
              Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts
            )
            .filter((cohort): cohort is CohortOption => Boolean(cohort)));

    setAvailableCohorts(cohortRows);
    setAssignedCohortIds((existingAssignments || []).map((assignment) => assignment.cohort_id));

    if (lesson) {
      const lessonSubject =
        supportedSubjects.find((subject) => subject.id === lesson.subject_id) ?? null;
      const gradeLevel = TEACHER_GRADE_OPTIONS.includes(
        lesson.grade_level as (typeof TEACHER_GRADE_OPTIONS)[number]
      )
        ? lesson.grade_level
        : TEACHER_GRADE_OPTIONS[0];
      setForm({
        title_ar: lesson.title_ar || "",
        title_en: lesson.title_en || "",
        description_ar: lesson.description_ar || "",
        description_en: lesson.description_en || "",
        subject_id: lessonSubject ? lesson.subject_id || "" : "",
        grade_level: gradeLevel,
        curriculum_topic: getCurriculumSelectionForLesson(
          lessonSubject,
          gradeLevel,
          lesson.curriculum_topic
        ),
        is_published: lesson.is_published,
        thumbnail_url: lesson.thumbnail_url || "",
        video_url_1080p: lesson.video_url_1080p || "",
        video_url_360p: lesson.video_url_360p || "",
        video_url_480p: lesson.video_url_480p || "",
        video_url_720p: lesson.video_url_720p || "",
        captions_ar_url: lesson.captions_ar_url || "",
        captions_en_url: lesson.captions_en_url || "",
        video_duration_seconds: lesson.video_duration_seconds ? String(lesson.video_duration_seconds) : "",
      });
    }

    const { data: questionRows } = await supabase
      .from("lesson_questions")
      .select("*")
      .eq("lesson_id", id)
      .order("display_order");

    const questionForms = (questionRows || []).map((q) => ({
      id: q.id,
      question_type: q.question_type,
      question_text_ar: q.question_text_ar,
      question_text_en: q.question_text_en || "",
      options: (q.options as string[] | null) || (q.question_type === "true_false" ? ["True", "False"] : ["", "", "", ""]),
      correct_answer: q.correct_answer || "",
      points: 10,
      timestamp_seconds: q.timestamp_seconds || 0,
      is_required: q.is_required ?? true,
      allow_retry: q.allow_retry ?? true,
    }));
    setQuestions(questionForms);

    const { data: taskRows } = await supabase
      .from("lesson_tasks")
      .select("*")
      .eq("lesson_id", id)
      .order("timestamp_seconds");

    const taskForms: TaskForm[] = (taskRows || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      task_type: t.task_type as TaskForm["task_type"],
      title_ar: (t.title_ar as string) || "",
      title_en: (t.title_en as string) || "",
      instruction_ar: (t.instruction_ar as string) || "",
      instruction_en: (t.instruction_en as string) || "",
      timestamp_seconds: (t.timestamp_seconds as number) || 0,
      task_data: (t.task_data as Record<string, unknown>) || {},
      timeout_seconds: t.timeout_seconds as number | null,
      is_skippable: (t.is_skippable as boolean) ?? true,
      points: (t.points as number) || 10,
    }));
    setLessonTasks(taskForms);

    const { data: blocks } = await supabase
      .from("lesson_content_blocks")
      .select("id, language, content, source_type, sequence")
      .eq("lesson_id", id)
      .order("sequence", { ascending: true });

    setContentBlocks(
      (blocks || []).map((block) => ({
        id: block.id,
        language: block.language as "ar" | "en",
        content: block.content,
        source_type: block.source_type || "lesson",
        sequence: block.sequence || 0,
      }))
    );

    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadLesson();
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadLesson]);

  // Load slide generation context from sessionStorage
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(getSlideGenerationContextStorageKey(id));
      if (!raw) { setSlideGenContext(null); return; }
      const parsed = parseSlideGenerationContext(JSON.parse(raw));
      setSlideGenContext(parsed);
      if (parsed?.requestedSlideCount) {
        const normalizedCount = clampSlideCount(parsed.requestedSlideCount);
        setSlideCount(normalizedCount);
        setSlideLengthPreset(getSlideLengthPresetFromCount(normalizedCount));
      }
    } catch { setSlideGenContext(null); }
    finally {
      window.sessionStorage.removeItem(getSlideGenerationContextStorageKey(id));
    }
  }, [id]);

  const handleSlideLengthPresetChange = useCallback((preset: SlideLengthPreset) => {
    const config = getSlideLengthPresetConfig(preset);
    setSlideLengthPreset(preset);
    setSlideCount(config.slideCount);
    setSlideGenContext((prev) => ({
      learningObjective: prev?.learningObjective || "",
      keyIdeas: prev?.keyIdeas || [],
      sourceNotes: prev?.sourceNotes || "",
      lessonDurationMinutes: config.lessonDurationMinutes,
      slideGoalMix: prev?.slideGoalMix || "balanced",
      requestedSlideCount: config.slideCount,
    }));
  }, []);

  const handleSaveSlides = useCallback(async () => {
    setSlideSaving(true);
    try {
      const res = await fetch(`/api/teacher/lessons/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert("Save failed: " + (data.error || "Unknown error"));
      } else {
        setSlideLastSaved(new Date().toLocaleTimeString());
      }
    } catch { alert("Save failed"); }
    finally { setSlideSaving(false); }
  }, [id, slides]);

  const handleSlideVideoReady = useCallback(
    async (urls: LessonVideoUrls) => {
      setForm((prev) => applyVideoUrlsToForm(prev, urls));

      try {
        await persistLessonVideoUrls(urls, "Recorded video saved");
      } catch (error) {
        setSaveMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Video save failed",
        });
      }
    },
    [persistLessonVideoUrls]
  );

  const handleUploadedVideoReady = useCallback(
    async (urls: LessonVideoUrls) => {
      setForm((prev) => applyVideoUrlsToForm(prev, urls));

      try {
        await persistLessonVideoUrls(urls, "Uploaded video saved");
      } catch (error) {
        setSaveMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Video save failed",
        });
      }
    },
    [persistLessonVideoUrls]
  );

  const slideGenerationBlockedReason = getCurriculumRequirementMessage(
    subjects.find((s) => s.id === form.subject_id) ?? null,
    form.grade_level,
    form.curriculum_topic
  );

  const selectedSubject = subjects.find((subject) => subject.id === form.subject_id) ?? null;
  const requiresCurriculum = hasMappedCurriculum(selectedSubject, form.grade_level);
  const contentGenerationBlockedReason = getCurriculumRequirementMessage(
    selectedSubject,
    form.grade_level,
    form.curriculum_topic
  );

  function updateQuestion(questionId: string, updates: Partial<QuestionForm>) {
    setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        question_type: "multiple_choice",
        question_text_ar: "",
        question_text_en: "",
        options: ["", "", "", ""],
        correct_answer: "",
        points: 10,
        timestamp_seconds: 0,
        is_required: true,
        allow_retry: true,
      },
    ]);
  }

  function removeQuestion(questionId: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  }

  function addContentBlock(language: "ar" | "en") {
    setContentBlocks((prev) => [
      ...prev,
      {
        language,
        content: "",
        source_type: "lesson",
        sequence: prev.length,
      },
    ]);
  }

  async function saveAll() {
    if (!form.title_ar.trim() || !form.subject_id) {
      setSaveMessage({ type: "error", text: "Title and subject are required." });
      return;
    }
    if (requiresCurriculum && !form.curriculum_topic) {
      setSaveMessage({ type: "error", text: "Select a curriculum topic before saving." });
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) {
      setSaving(false);
      setSaveMessage({ type: "error", text: "You must be signed in to save." });
      return;
    }

    try {
      // Save lesson details
      const { error: lessonError } = await supabase
        .from("lessons")
        .update({
          title_ar: form.title_ar.trim(),
          title_en: form.title_en.trim(),
          description_ar: form.description_ar.trim() || null,
          description_en: form.description_en.trim() || null,
          subject_id: form.subject_id,
          grade_level: form.grade_level,
          curriculum_topic: serializeCurriculumSelection(form.curriculum_topic),
          is_published: form.is_published,
          thumbnail_url: form.thumbnail_url.trim() || null,
          video_url_1080p: form.video_url_1080p.trim() || null,
          video_url_360p: form.video_url_360p.trim() || null,
          video_url_480p: form.video_url_480p.trim() || null,
          video_url_720p: form.video_url_720p.trim() || null,
          captions_ar_url: form.captions_ar_url.trim() || null,
          captions_en_url: form.captions_en_url.trim() || null,
          video_duration_seconds: form.video_duration_seconds ? Number(form.video_duration_seconds) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (lessonError) throw new Error("Lesson: " + lessonError.message);

      const uniqueAssignedCohortIds = Array.from(new Set(assignedCohortIds));
      const { error: deleteAssignmentsError } = await supabase
        .from("cohort_lessons")
        .delete()
        .eq("lesson_id", id);

      if (deleteAssignmentsError) {
        throw new Error("Class access: " + deleteAssignmentsError.message);
      }

      if (uniqueAssignedCohortIds.length > 0) {
        const { error: insertAssignmentsError } = await supabase
          .from("cohort_lessons")
          .insert(
            uniqueAssignedCohortIds.map((cohortId) => ({
              cohort_id: cohortId,
              lesson_id: id,
              assigned_by: user.id,
              is_active: true,
            }))
          );

        if (insertAssignmentsError) {
          throw new Error("Class access: " + insertAssignmentsError.message);
        }
      }

      // Save questions
      await supabase.from("lesson_questions").delete().eq("lesson_id", id);
      if (questions.length > 0) {
        const questionRows = questions.map((q, index) => ({
          lesson_id: id,
          question_type: q.question_type,
          question_text_ar: q.question_text_ar,
          question_text_en: q.question_text_en || null,
          options: q.question_type === "fill_in_blank" ? null : q.options.filter((opt) => opt.trim()),
          correct_answer: q.correct_answer,
          explanation_ar: null,
          explanation_en: null,
          is_required: q.is_required,
          allow_retry: q.allow_retry,
          display_order: index + 1,
          timestamp_seconds: q.timestamp_seconds || 0,
        }));
        const { error: qError } = await supabase.from("lesson_questions").insert(questionRows);
        if (qError) throw new Error("Questions: " + qError.message);
      }

      // Save tasks
      await supabase.from("lesson_tasks").delete().eq("lesson_id", id);
      if (lessonTasks.length > 0) {
        const taskRows: Database["public"]["Tables"]["lesson_tasks"]["Insert"][] = lessonTasks.map((t, index) => ({
          lesson_id: id,
          task_type: t.task_type as "matching_pairs" | "sorting_order" | "fill_in_blank_enhanced" | "drag_drop_label" | "drawing_tracing" | "audio_recording",
          title_ar: t.title_ar,
          title_en: t.title_en || null,
          instruction_ar: t.instruction_ar,
          instruction_en: t.instruction_en || null,
          timestamp_seconds: t.timestamp_seconds || 0,
          task_data: t.task_data as Database["public"]["Tables"]["lesson_tasks"]["Insert"]["task_data"],
          timeout_seconds: t.timeout_seconds,
          is_skippable: t.is_skippable,
          points: t.points,
          display_order: index,
        }));
        const { error: tError } = await supabase.from("lesson_tasks").insert(taskRows);
        if (tError) throw new Error("Tasks: " + tError.message);
      }

      // Save content blocks
      await fetch("/api/teacher/lessons/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: id,
          blocks: contentBlocks.map((block, index) => ({
            language: block.language,
            content: block.content,
            source_type: block.source_type,
            sequence: index,
          })),
        }),
      });

      setSaveMessage({ type: "success", text: "Saved" });
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function rebuildEmbeddings() {
    setSaveMessage({ type: "success", text: "Embedding..." });
    const response = await fetch("/api/teacher/lessons/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSaveMessage({ type: "error", text: data.error || "Failed to embed" });
      return;
    }
    setSaveMessage({ type: "success", text: `Embedded ${data.count || 0} chunks` });
    setTimeout(() => setSaveMessage(null), 3000);
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "details", label: "Details" },
    { key: "slides", label: "Slides", count: slides.length },
    { key: "questions", label: "Questions & Tasks", count: questions.length + lessonTasks.length },
    { key: "content", label: "Content", count: contentBlocks.length },
    { key: "results", label: "Results" },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link href="/teacher/lessons" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Lessons
              </Link>
              <div className="flex items-center gap-2.5 mt-0.5">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {form.title_en || form.title_ar || "Untitled Lesson"}
                </h1>
                <button
                  onClick={() => setForm({ ...form, is_published: !form.is_published })}
                  className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                    form.is_published
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {form.is_published ? "Published" : "Draft"}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saveMessage && (
                <span className={`text-xs font-medium ${saveMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                  {saveMessage.text}
                </span>
              )}
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors relative ${
                  activeTab === tab.key
                    ? "text-emerald-700 bg-gray-50/80"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className={activeTab === "slides" ? "py-4" : "max-w-5xl mx-auto px-6 py-6"}>
        {activeTab === "details" && (
        <DetailsTab
          form={form}
          setForm={setForm}
            subjects={subjects}
            selectedSubject={selectedSubject}
            availableCohorts={availableCohorts}
            assignedCohortIds={assignedCohortIds}
            setAssignedCohortIds={setAssignedCohortIds}
          videoInputMode={videoInputMode}
          setVideoInputMode={setVideoInputMode}
          lessonId={id}
          onVideosReady={handleUploadedVideoReady}
        />
        )}

        {activeTab === "slides" && (
          <div className="max-w-[1600px] mx-auto px-4 space-y-4">
            {/* Slide toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {slides.length > 0 ? `${slides.length} slides` : "No slides yet"}
                </span>
                {slideLastSaved && (
                  <span className="text-xs text-gray-400">Last saved: {slideLastSaved}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isGeneratingSlides && (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Lesson Length
                    </label>
                    <select
                      value={slideLengthPreset}
                      onChange={(e) =>
                        handleSlideLengthPresetChange(e.target.value as SlideLengthPreset)
                      }
                      className="border-0 bg-transparent p-0 pr-6 text-sm font-semibold text-gray-900 focus:ring-0"
                    >
                      {SLIDE_LENGTH_PRESET_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <SlideGenerateButton
                  lessonId={id}
                  hasExistingSlides={slides.length > 0}
                  languageMode={slideLanguageMode}
                  generationContext={slideGenContext}
                  slideCount={slideCount}
                  disabledReason={slideGenerationBlockedReason}
                  onGenerated={(newSlides) => setSlides(newSlides)}
                  onGeneratingChange={(generating, progress) => {
                    setIsGeneratingSlides(generating);
                    setSlideGenProgress(progress);
                  }}
                  compact
                />
              </div>
            </div>

            {/* Slide content */}
            {slides.length === 0 ? (
              isGeneratingSlides ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-6">
                  <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{slideGenProgress || "Generating slides..."}</h3>
                    <p className="text-sm text-gray-500 mt-1">This usually takes 15-30 seconds.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                    {Array.from({ length: slideCount }).map((_, i) => (
                      <div key={i} className="aspect-[16/10] rounded-lg bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-violet-50 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">No Slides Yet</h3>
                  <p className="text-sm text-gray-500">
                    Use the Generate button above to create slides with AI, or they can be manually created.
                  </p>
                </div>
              )
            ) : (
              <SlideEditor
                slides={slides}
                onChange={setSlides}
                onSave={handleSaveSlides}
                saving={slideSaving}
                preferredLanguage={slideLanguageMode === "en" ? "en" : "ar"}
                lessonId={id}
                lessonTitle={form.title_ar || form.title_en || ""}
                onVideoReady={handleSlideVideoReady}
              />
            )}
          </div>
        )}

        {activeTab === "questions" && (
          <QuestionsTasksTab
            questions={questions}
            lessonTasks={lessonTasks}
            updateQuestion={updateQuestion}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
            setLessonTasks={setLessonTasks}
          />
        )}

        {activeTab === "content" && (
          <ContentTab
            lessonId={id}
            form={form}
            questions={questions}
            contentBlocks={contentBlocks}
            setContentBlocks={setContentBlocks}
            setQuestions={setQuestions}
            setLessonTasks={setLessonTasks}
            addContentBlock={addContentBlock}
            contentGenerationBlockedReason={contentGenerationBlockedReason}
            rebuildEmbeddings={rebuildEmbeddings}
          />
        )}

        {activeTab === "results" && (
          <div className="space-y-4">
            <InteractionResultsPanel lessonId={id} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Details Tab ─── */

function DetailsTab({
  form,
  setForm,
  subjects,
  selectedSubject,
  availableCohorts,
  assignedCohortIds,
  setAssignedCohortIds,
  videoInputMode,
  setVideoInputMode,
  lessonId,
  onVideosReady,
}: {
  form: LessonForm;
  setForm: (f: LessonForm | ((prev: LessonForm) => LessonForm)) => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  availableCohorts: CohortOption[];
  assignedCohortIds: string[];
  setAssignedCohortIds: (value: string[] | ((prev: string[]) => string[])) => void;
  videoInputMode: "upload" | "manual";
  setVideoInputMode: (mode: "upload" | "manual") => void;
  lessonId: string;
  onVideosReady: (urls: LessonVideoUrls) => void | Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {/* Titles */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Lesson Info</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (Arabic)</label>
            <input
              value={form.title_ar}
              onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (English)</label>
            <input
              value={form.title_en}
              onChange={(e) => setForm({ ...form, title_en: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={form.subject_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  subject_id: e.target.value,
                  curriculum_topic: null,
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Select subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name_en} / {subject.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
            <select
              value={form.grade_level}
              onChange={(e) =>
                setForm({
                  ...form,
                  grade_level: Number(e.target.value),
                  curriculum_topic: null,
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              {TEACHER_GRADE_OPTIONS.map((grade) => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>
        </div>

        {form.subject_id && (
          <CurriculumTopicSelector
            subject={selectedSubject}
            gradeLevel={form.grade_level}
            value={form.curriculum_topic}
            onChange={(selection) =>
              setForm((prev) => ({
                ...prev,
                curriculum_topic: selection,
              }))
            }
          />
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Arabic)</label>
            <textarea
              value={form.description_ar}
              onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
            <textarea
              value={form.description_en}
              onChange={(e) => setForm({ ...form, description_en: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </section>

      {/* Class Access */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Class Access</h2>
            <p className="mt-2 text-sm text-gray-500">
              If no classes are selected, this lesson stays available to all students when published. Selecting one or
              more classes restricts the lesson to those class members.
            </p>
          </div>
          {assignedCohortIds.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {assignedCohortIds.length} class{assignedCohortIds.length === 1 ? "" : "es"} assigned
            </span>
          )}
        </div>

        {availableCohorts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            No classes available yet. Create a class first if this lesson should only be visible to specific students.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {availableCohorts.map((cohort) => {
              const checked = assignedCohortIds.includes(cohort.id);

              return (
                <label
                  key={cohort.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    checked
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  } ${cohort.is_active ? "" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      setAssignedCohortIds((prev) =>
                        nextChecked
                          ? [...prev, cohort.id]
                          : prev.filter((cohortId) => cohortId !== cohort.id)
                      );
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{cohort.name}</span>
                      {!cohort.is_active && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Grade {cohort.grade_level}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* Video & Media */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Video & Media</h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setVideoInputMode("upload")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                videoInputMode === "upload"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setVideoInputMode("manual")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                videoInputMode === "manual"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Manual URLs
            </button>
          </div>
        </div>

        <VideoPreview
          video_url_1080p={form.video_url_1080p}
          video_url_720p={form.video_url_720p}
          video_url_480p={form.video_url_480p}
          video_url_360p={form.video_url_360p}
        />

        {videoInputMode === "upload" ? (
          <BunnyVideoUploader
            lessonId={lessonId}
            lessonTitle={form.title_ar || form.title_en || "Untitled"}
            onVideosReady={(urls) => {
              void onVideosReady(urls);
            }}
            currentVideoUrl={form.video_url_1080p || form.video_url_720p || undefined}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video 1080p</label>
                <input
                  value={form.video_url_1080p}
                  onChange={(e) => setForm({ ...form, video_url_1080p: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video 360p</label>
                <input
                  value={form.video_url_360p}
                  onChange={(e) => setForm({ ...form, video_url_360p: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video 480p</label>
                <input
                  value={form.video_url_480p}
                  onChange={(e) => setForm({ ...form, video_url_480p: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video 720p</label>
                <input
                  value={form.video_url_720p}
                  onChange={(e) => setForm({ ...form, video_url_720p: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Captions (Arabic)</label>
                <input
                  value={form.captions_ar_url}
                  onChange={(e) => setForm({ ...form, captions_ar_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Captions (English)</label>
                <input
                  value={form.captions_en_url}
                  onChange={(e) => setForm({ ...form, captions_en_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Thumbnail URL</label>
          <input
            value={form.thumbnail_url}
            onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
      </section>

    </div>
  );
}

/* ─── Questions & Tasks Tab ─── */

function QuestionsTasksTab({
  questions,
  lessonTasks,
  updateQuestion,
  addQuestion,
  removeQuestion,
  setLessonTasks,
}: {
  questions: QuestionForm[];
  lessonTasks: TaskForm[];
  updateQuestion: (id: string, updates: Partial<QuestionForm>) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
  setLessonTasks: (tasks: TaskForm[] | ((prev: TaskForm[]) => TaskForm[])) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Questions */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Questions {questions.length > 0 && <span className="text-gray-400">({questions.length})</span>}
          </h2>
          <button
            onClick={addQuestion}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
          >
            + Add Question
          </button>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400">No questions yet. Add one manually or use the AI generator in the Content tab.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((question, index) => (
              <div key={question.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Q{index + 1}</span>
                  <button
                    onClick={() => removeQuestion(question.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Arabic Text</label>
                    <input
                      value={question.question_text_ar}
                      onChange={(e) => updateQuestion(question.id, { question_text_ar: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">English Text</label>
                    <input
                      value={question.question_text_en}
                      onChange={(e) => updateQuestion(question.id, { question_text_en: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select
                      value={question.question_type}
                      onChange={(e) =>
                        updateQuestion(question.id, { question_type: e.target.value as QuestionForm["question_type"] })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="fill_in_blank">Fill in the Blank</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Correct Answer</label>
                    <input
                      value={question.correct_answer}
                      onChange={(e) => updateQuestion(question.id, { correct_answer: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Points</label>
                    <input
                      type="number"
                      value={question.points}
                      onChange={(e) => updateQuestion(question.id, { points: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Timestamp (sec)</label>
                    <input
                      type="number"
                      value={question.timestamp_seconds}
                      onChange={(e) => updateQuestion(question.id, { timestamp_seconds: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {question.question_type !== "fill_in_blank" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Options</label>
                    <div className="grid md:grid-cols-2 gap-2">
                      {question.options.map((option, idx) => (
                        <input
                          key={`${question.id}-opt-${idx}`}
                          value={option}
                          onChange={(e) => {
                            const next = [...question.options];
                            next[idx] = e.target.value;
                            updateQuestion(question.id, { options: next });
                          }}
                          placeholder={`Option ${idx + 1}`}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 text-gray-600">
                    <input
                      type="checkbox"
                      checked={question.is_required}
                      onChange={(e) => updateQuestion(question.id, { is_required: e.target.checked })}
                      className="rounded"
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2 text-gray-600">
                    <input
                      type="checkbox"
                      checked={question.allow_retry}
                      onChange={(e) => updateQuestion(question.id, { allow_retry: e.target.checked })}
                      className="rounded"
                    />
                    Allow retry
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tasks */}
      <section className="bg-white rounded-xl border border-gray-100 p-5">
        <TaskEditor
          tasks={lessonTasks}
          onChange={setLessonTasks}
          onSave={() => {}}
          saving={false}
          hideSaveButton
        />
      </section>
    </div>
  );
}

/* ─── Content Tab ─── */

function ContentTab({
  lessonId,
  form,
  questions,
  contentBlocks,
  setContentBlocks,
  setQuestions,
  setLessonTasks,
  addContentBlock,
  contentGenerationBlockedReason,
  rebuildEmbeddings,
}: {
  lessonId: string;
  form: LessonForm;
  questions: QuestionForm[];
  contentBlocks: ContentBlock[];
  setContentBlocks: (blocks: ContentBlock[] | ((prev: ContentBlock[]) => ContentBlock[])) => void;
  setQuestions: (questions: QuestionForm[]) => void;
  setLessonTasks: (tasks: TaskForm[] | ((prev: TaskForm[]) => TaskForm[])) => void;
  addContentBlock: (language: "ar" | "en") => void;
  contentGenerationBlockedReason: string | null;
  rebuildEmbeddings: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* AI Generator */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">AI Content Generator</h2>
        <AIContentGenerator
          lessonId={lessonId}
          hasVideo={!!(form.video_url_1080p || form.video_url_360p || form.video_url_480p || form.video_url_720p)}
          hasExistingContent={questions.length > 0 || contentBlocks.length > 0}
          disabledReason={contentGenerationBlockedReason}
          onGenerated={(data) => {
            const newQuestions: QuestionForm[] = data.questions.map((q) => ({
              id: crypto.randomUUID(),
              question_type: q.question_type,
              question_text_ar: q.question_text_ar,
              question_text_en: q.question_text_en,
              options: q.options || (q.question_type === "true_false" ? ["صحيح", "خطأ"] : []),
              correct_answer: q.correct_answer,
              points: 10,
              timestamp_seconds: q.timestamp_seconds,
              is_required: q.is_required,
              allow_retry: q.allow_retry,
            }));
            setQuestions(newQuestions);

            const newBlocks: ContentBlock[] = data.contentBlocks.map((b) => ({
              language: b.language,
              content: b.content,
              source_type: b.source_type,
              sequence: b.sequence,
            }));
            setContentBlocks(newBlocks);

            if (data.tasks && data.tasks.length > 0) {
              const newTasks: TaskForm[] = data.tasks.map((t) => ({
                id: crypto.randomUUID(),
                task_type: t.task_type as TaskForm["task_type"],
                title_ar: t.title_ar,
                title_en: t.title_en,
                instruction_ar: t.instruction_ar,
                instruction_en: t.instruction_en,
                timestamp_seconds: t.timestamp_seconds,
                task_data: t.task_data,
                timeout_seconds: null,
                is_skippable: t.is_skippable,
                points: t.points,
              }));
              setLessonTasks(newTasks);
            }
          }}
        />
      </section>

      {/* Content Blocks */}
      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Content Blocks {contentBlocks.length > 0 && <span className="text-gray-400">({contentBlocks.length})</span>}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => addContentBlock("ar")}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
            >
              + Arabic
            </button>
            <button
              onClick={() => addContentBlock("en")}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors"
            >
              + English
            </button>
          </div>
        </div>

        {contentBlocks.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400">No content blocks yet. Use the AI generator or add manually.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contentBlocks.map((block, index) => (
              <div key={`${block.language}-${index}`} className="border border-gray-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <select
                    value={block.language}
                    onChange={(e) => {
                      const next = [...contentBlocks];
                      next[index] = { ...block, language: e.target.value as "ar" | "en" };
                      setContentBlocks(next);
                    }}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="ar">Arabic</option>
                    <option value="en">English</option>
                  </select>
                  <input
                    value={block.source_type}
                    onChange={(e) => {
                      const next = [...contentBlocks];
                      next[index] = { ...block, source_type: e.target.value };
                      setContentBlocks(next);
                    }}
                    placeholder="Source type"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => setContentBlocks(contentBlocks.filter((_, idx) => idx !== index))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={block.content}
                  onChange={(e) => {
                    const next = [...contentBlocks];
                    next[index] = { ...block, content: e.target.value };
                    setContentBlocks(next);
                  }}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={rebuildEmbeddings}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            Rebuild Embeddings
          </button>
        </div>
      </section>
    </div>
  );
}

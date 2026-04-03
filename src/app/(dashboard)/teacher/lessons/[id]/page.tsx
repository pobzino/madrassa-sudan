"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import AIContentGenerator from "@/components/teacher/AIContentGenerator";
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
import type { Slide, SlideInteractionType } from "@/lib/slides.types";
import {
  ACTIVITY_TYPE_OPTIONS,
  createDraftActivitySlide,
  ensureSlidesForSupportedTasks,
  getEffectiveActivityTimings,
  isCanonicalActivityTask,
  normalizeLessonTaskForm,
  syncTaskFormsFromSlides,
} from "@/lib/lesson-activities";
import type { LessonTaskForm } from "@/lib/tasks.types";
import { toPlayableVideoUrl } from "@/lib/bunny-playback";
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

type Tab = "details" | "questions" | "activities" | "slides" | "content" | "results";

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

function formatTimestampLabel(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getTeacherPreviewVideoUrl(form: LessonForm) {
  return toPlayableVideoUrl(
    form.video_url_720p ||
      form.video_url_480p ||
      form.video_url_360p ||
      form.video_url_1080p ||
      ""
  );
}

async function syncLessonQuestions(
  supabase: ReturnType<typeof createClient>,
  lessonId: string,
  questions: QuestionForm[]
) {
  const { data: existingRows, error: existingError } = await supabase
    .from("lesson_questions")
    .select("id")
    .eq("lesson_id", lessonId);

  if (existingError) {
    throw new Error("Questions: " + existingError.message);
  }

  const nextRows = questions.map((question, index) => ({
    id: question.id,
    lesson_id: lessonId,
    question_type: question.question_type,
    question_text_ar: question.question_text_ar,
    question_text_en: question.question_text_en || null,
    options:
      question.question_type === "fill_in_blank"
        ? null
        : question.options.filter((option) => option.trim()),
    correct_answer: question.correct_answer,
    explanation_ar: null,
    explanation_en: null,
    is_required: question.is_required,
    allow_retry: question.allow_retry,
    display_order: index + 1,
    timestamp_seconds: question.timestamp_seconds || 0,
  }));

  if (nextRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("lesson_questions")
      .upsert(nextRows, { onConflict: "id" });

    if (upsertError) {
      throw new Error("Questions: " + upsertError.message);
    }
  }

  const nextIds = new Set(nextRows.map((row) => row.id));
  const removedIds = (existingRows || [])
    .map((row) => row.id)
    .filter((rowId) => !nextIds.has(rowId));

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("lesson_questions")
      .delete()
      .in("id", removedIds);

    if (deleteError) {
      throw new Error("Questions: " + deleteError.message);
    }
  }
}

async function syncLessonTasks(
  supabase: ReturnType<typeof createClient>,
  lessonId: string,
  tasks: LessonTaskForm[]
) {
  const normalizedTasks = tasks.map(normalizeLessonTaskForm);
  const { data: existingRows, error: existingError } = await supabase
    .from("lesson_tasks")
    .select("id")
    .eq("lesson_id", lessonId);

  if (existingError) {
    throw new Error("Activities: " + existingError.message);
  }

  const nextRows: Database["public"]["Tables"]["lesson_tasks"]["Insert"][] = normalizedTasks.map((task, index) => ({
    id: task.id,
    lesson_id: lessonId,
    task_type: task.task_type as Database["public"]["Tables"]["lesson_tasks"]["Insert"]["task_type"],
    title_ar: task.title_ar,
    title_en: task.title_en || null,
    instruction_ar: task.instruction_ar,
    instruction_en: task.instruction_en || null,
    timestamp_seconds: task.timestamp_seconds || 0,
    display_order: index,
    task_data: task.task_data as Database["public"]["Tables"]["lesson_tasks"]["Insert"]["task_data"],
    timeout_seconds: task.timeout_seconds,
    is_skippable: task.is_skippable,
    required: task.required,
    linked_slide_id: task.linked_slide_id,
    points: task.points,
  }));

  if (nextRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("lesson_tasks")
      .upsert(nextRows, { onConflict: "id" });

    if (upsertError) {
      throw new Error("Activities: " + upsertError.message);
    }
  }

  const nextIds = new Set(nextRows.map((row) => row.id as string));
  const removedIds = (existingRows || [])
    .map((row) => row.id)
    .filter((rowId) => !nextIds.has(rowId));

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("lesson_tasks")
      .delete()
      .in("id", removedIds);

    if (deleteError) {
      throw new Error("Activities: " + deleteError.message);
    }
  }
}

export default function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, loading: authLoading } = useTeacherGuard();
  const [deleting, setDeleting] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [availableCohorts, setAvailableCohorts] = useState<CohortOption[]>([]);
  const [assignedCohortIds, setAssignedCohortIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideSaving, setSlideSaving] = useState(false);
  const [slideLastSaved, setSlideLastSaved] = useState<string | null>(null);
  const [slideGenContext, setSlideGenContext] = useState<SlideGenerationContext | null>(null);
  const [slideEditorFocusId, setSlideEditorFocusId] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(
    getSlideLengthPresetConfig(DEFAULT_SLIDE_LENGTH_PRESET).slideCount
  );
  const [slideLengthPreset, setSlideLengthPreset] = useState<SlideLengthPreset>(
    DEFAULT_SLIDE_LENGTH_PRESET
  );
  const [slideLanguageMode, setSlideLanguageMode] = useState<SlideLanguageMode>("ar");
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [slideGenProgress, setSlideGenProgress] = useState("");
  const canPublishLesson = profile?.role === "admin";

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
  const [lessonTasks, setLessonTasks] = useState<LessonTaskForm[]>([]);
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

    const loadedSlides = Array.isArray(slidesRes?.slideDeck?.slides)
      ? (slidesRes.slideDeck.slides as Slide[])
      : [];
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

    const taskForms: LessonTaskForm[] = (taskRows || []).map((task) =>
      normalizeLessonTaskForm({
        ...(task as unknown as Partial<LessonTaskForm>),
        id: task.id,
        task_type: String(task.task_type),
      })
    );
    const slidesWithActivities = ensureSlidesForSupportedTasks(loadedSlides, taskForms);
    const syncedTasks = syncTaskFormsFromSlides(slidesWithActivities, taskForms);
    setSlides(slidesWithActivities);
    setLessonTasks(syncedTasks);

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

  useEffect(() => {
    setLessonTasks((previous) => syncTaskFormsFromSlides(slides, previous));
  }, [slides]);

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

  const handleAddActivity = useCallback(
    (interactionType: SlideInteractionType) => {
      const newSlide = createDraftActivitySlide(interactionType, slides.length);
      const nextSlides = [...slides, newSlide].map((slide, index) => ({
        ...slide,
        sequence: index,
      }));
      const syncedTasks = syncTaskFormsFromSlides(nextSlides, lessonTasks);
      setSlides(nextSlides);
      setLessonTasks(syncedTasks);
      setSlideEditorFocusId(newSlide.id);
      setActiveTab("slides");
    },
    [lessonTasks, slides]
  );

  const handleRemoveActivity = useCallback(
    (activityId: string) => {
      const task = lessonTasks.find((candidate) => candidate.id === activityId);
      if (!task) {
        return;
      }

      const nextSlides = slides
        .filter(
          (slide) =>
            slide.id !== task.linked_slide_id &&
            slide.activity_id !== activityId
        )
        .map((slide, index) => ({
          ...slide,
          sequence: index,
        }));
      const remainingTasks = lessonTasks.filter((candidate) => candidate.id !== activityId);
      const syncedTasks = syncTaskFormsFromSlides(nextSlides, remainingTasks);
      setSlides(nextSlides);
      setLessonTasks(syncedTasks);
    },
    [lessonTasks, slides]
  );

  const handleEditActivitySlide = useCallback((slideId: string | null) => {
    if (!slideId) {
      return;
    }

    setSlideEditorFocusId(slideId);
    setActiveTab("slides");
  }, []);

  const handleSaveSlides = useCallback(async () => {
    setSlideSaving(true);
    try {
      const slidesWithActivities = ensureSlidesForSupportedTasks(slides, lessonTasks);
      const syncedTasks = syncTaskFormsFromSlides(slidesWithActivities, lessonTasks);
      setSlides(slidesWithActivities);
      setLessonTasks(syncedTasks);
      const res = await fetch(`/api/teacher/lessons/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesWithActivities,
          language_mode: slideLanguageMode,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert("Save failed: " + (data.error || "Unknown error"));
      } else {
        setSlideLastSaved(new Date().toLocaleTimeString());
      }
    } catch { alert("Save failed"); }
    finally { setSlideSaving(false); }
  }, [id, lessonTasks, slideLanguageMode, slides]);

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

      const slidesWithActivities = ensureSlidesForSupportedTasks(slides, lessonTasks);
      const syncedTasks = syncTaskFormsFromSlides(slidesWithActivities, lessonTasks);
      setSlides(slidesWithActivities);
      setLessonTasks(syncedTasks);

      const slideSaveResponse = await fetch(`/api/teacher/lessons/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesWithActivities,
          language_mode: slideLanguageMode,
        }),
      });

      if (!slideSaveResponse.ok) {
        const data = await slideSaveResponse.json().catch(() => ({}));
        throw new Error("Slides: " + (data.error || "Failed to save slides"));
      }

      await syncLessonQuestions(supabase, id, questions);
      await syncLessonTasks(supabase, id, syncedTasks);

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

  const tabs: { key: Tab; label: string; description: string; count?: number }[] = [
    { key: "details", label: "Details", description: "Lesson info, classes, and publishing" },
    {
      key: "questions",
      label: "Questions",
      description: "Quiz checkpoints inside the lesson",
      count: questions.length,
    },
    {
      key: "activities",
      label: "Activities",
      description: "Interactive tasks linked to activity slides",
      count: lessonTasks.filter(
        (task) => task.linked_slide_id && isCanonicalActivityTask(task.task_type)
      ).length,
    },
    {
      key: "slides",
      label: "Slides",
      description: "Deck editing, generation, and recording",
      count: slides.length,
    },
    {
      key: "content",
      label: "Content",
      description: "AI lesson content and source material",
      count: contentBlocks.length,
    },
    { key: "results", label: "Results", description: "Student progress and activity data" },
  ];

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-6 lg:px-8">
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
                  onClick={() => {
                    if (!canPublishLesson) return;
                    setForm({ ...form, is_published: !form.is_published });
                  }}
                  disabled={!canPublishLesson}
                  className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                    form.is_published
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  } ${!canPublishLesson ? "cursor-not-allowed opacity-70 hover:bg-inherit" : ""}`}
                  title={!canPublishLesson ? "Only admins can change lesson publish status." : undefined}
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
                onClick={async () => {
                  if (!window.confirm("Delete this lesson and all its content? This cannot be undone.")) return;
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/teacher/lessons/${id}`, { method: "DELETE" });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      alert(data.error || "Failed to delete lesson");
                      return;
                    }
                    router.push("/teacher/lessons");
                  } catch {
                    alert("Failed to delete lesson");
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting || saving}
                className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="min-w-0">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:sticky lg:top-24">
            <div className="border-b border-gray-100 px-2 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Lesson Editor
              </p>
              <h2 className="mt-2 text-sm font-semibold text-gray-900">{activeTabMeta.label}</h2>
              <p className="mt-1 text-sm text-gray-500">{activeTabMeta.description}</p>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`min-w-[170px] rounded-2xl border px-4 py-3 text-left transition-all lg:min-w-0 ${
                      isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm"
                        : "border-transparent bg-gray-50 text-gray-700 hover:border-gray-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{tab.label}</span>
                      {tab.count != null && (
                        <span
                          className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isActive
                              ? "bg-white text-emerald-700"
                              : "bg-white text-gray-500"
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs ${isActive ? "text-emerald-700/90" : "text-gray-500"}`}>
                      {tab.description}
                    </p>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          <div className={activeTab === "slides" ? "space-y-4" : "mx-auto max-w-5xl space-y-4"}>
            {activeTab === "details" && (
              <DetailsTab
                form={form}
                setForm={setForm}
                subjects={subjects}
                selectedSubject={selectedSubject}
                availableCohorts={availableCohorts}
                assignedCohortIds={assignedCohortIds}
                setAssignedCohortIds={setAssignedCohortIds}
                canPublishLesson={canPublishLesson}
              />
            )}

            {activeTab === "slides" && (
              <div className="max-w-[1600px] space-y-4">
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
                          <div
                            key={i}
                            className="aspect-[16/10] rounded-lg bg-gray-100 animate-pulse"
                            style={{ animationDelay: `${i * 100}ms` }}
                          />
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
                    focusedSlideId={slideEditorFocusId}
                  />
                )}
              </div>
            )}

            {activeTab === "questions" && (
              <QuestionsTab
                questions={questions}
                updateQuestion={updateQuestion}
                addQuestion={addQuestion}
                removeQuestion={removeQuestion}
              />
            )}

            {activeTab === "activities" && (
              <ActivitiesTab
                slides={slides}
                lessonTasks={lessonTasks}
                videoUrl={getTeacherPreviewVideoUrl(form)}
                videoDurationSeconds={
                  form.video_duration_seconds ? Number(form.video_duration_seconds) : null
                }
                setLessonTasks={setLessonTasks}
                onAddActivity={handleAddActivity}
                onRemoveActivity={handleRemoveActivity}
                onEditSlide={handleEditActivitySlide}
              />
            )}

            {activeTab === "content" && (
              <ContentTab
                lessonId={id}
                form={form}
                slides={slides}
                questions={questions}
                contentBlocks={contentBlocks}
                setContentBlocks={setContentBlocks}
                setQuestions={setQuestions}
                setSlides={setSlides}
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
        </main>
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
  canPublishLesson,
}: {
  form: LessonForm;
  setForm: (f: LessonForm | ((prev: LessonForm) => LessonForm)) => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  availableCohorts: CohortOption[];
  assignedCohortIds: string[];
  setAssignedCohortIds: (value: string[] | ((prev: string[]) => string[])) => void;
  canPublishLesson: boolean;
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
            {!canPublishLesson && (
              <p className="mt-2 text-sm text-amber-600">
                Only admins can publish or unpublish lessons.
              </p>
            )}
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


    </div>
  );
}

/* ─── Questions Tab ─── */

function QuestionsTab({
  questions,
  updateQuestion,
  addQuestion,
  removeQuestion,
}: {
  questions: QuestionForm[];
  updateQuestion: (id: string, updates: Partial<QuestionForm>) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
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
    </div>
  );
}

/* ─── Activities Tab ─── */

function ActivitiesTab({
  slides,
  lessonTasks,
  videoUrl,
  videoDurationSeconds,
  setLessonTasks,
  onAddActivity,
  onRemoveActivity,
  onEditSlide,
}: {
  slides: Slide[];
  lessonTasks: LessonTaskForm[];
  videoUrl: string;
  videoDurationSeconds: number | null;
  setLessonTasks: (tasks: LessonTaskForm[] | ((prev: LessonTaskForm[]) => LessonTaskForm[])) => void;
  onAddActivity: (interactionType: SlideInteractionType) => void;
  onRemoveActivity: (activityId: string) => void;
  onEditSlide: (slideId: string | null) => void;
}) {
  const activities = lessonTasks.filter(
    (task) => task.linked_slide_id && isCanonicalActivityTask(task.task_type)
  );
  const hiddenLegacyTasks = lessonTasks.filter(
    (task) => !task.linked_slide_id || !isCanonicalActivityTask(task.task_type)
  );
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [loadedPreviewDuration, setLoadedPreviewDuration] = useState(0);
  const [showActivityPicker, setShowActivityPicker] = useState(false);

  const updateActivity = useCallback((activityId: string, updates: Partial<LessonTaskForm>) => {
    setLessonTasks((current) =>
      current.map((task) => (task.id === activityId ? { ...task, ...updates } : task))
    );
  }, [setLessonTasks]);

  const effectiveDuration = loadedPreviewDuration > 0 ? loadedPreviewDuration : videoDurationSeconds;
  const timedActivities = useMemo(
    () => getEffectiveActivityTimings(slides, activities, effectiveDuration),
    [activities, effectiveDuration, slides]
  );
  const activityTimingById = useMemo(
    () => new Map(timedActivities.map((timing) => [timing.task.id, timing])),
    [timedActivities]
  );

  const seekPreviewVideo = useCallback((timeInSeconds: number) => {
    if (!previewVideoRef.current) {
      return;
    }

    previewVideoRef.current.currentTime = timeInSeconds;
    setPreviewCurrentTime(timeInSeconds);
  }, []);

  const stampCurrentVideoTime = useCallback(
    (activityId: string) => {
      const sourceTime = previewVideoRef.current?.currentTime ?? previewCurrentTime;
      updateActivity(activityId, { timestamp_seconds: Math.max(0, Math.round(sourceTime)) });
    },
    [previewCurrentTime, updateActivity]
  );

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Activities {activities.length > 0 && <span className="text-gray-400">({activities.length})</span>}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Build interactive checkpoints here. Adding one creates the linked activity slide and opens it right away.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowActivityPicker(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Activity
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-sm text-amber-700">
            No activities yet. Use an add button above to create a linked activity slide and jump straight into editing it.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Activity Timeline</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Leave the timestamp blank to place an activity automatically from its linked slide order.
                    Use the preview video to stamp an exact trigger time when needed.
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                  Preview time: {formatTimestampLabel(previewCurrentTime)}
                </div>
              </div>

              {videoUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-black">
                  <video
                    ref={previewVideoRef}
                    src={videoUrl}
                    controls
                    preload="metadata"
                    className="aspect-video w-full bg-black"
                    onTimeUpdate={(event) => {
                      setPreviewCurrentTime(event.currentTarget.currentTime);
                    }}
                    onLoadedMetadata={(event) => {
                      const nextDuration = Number.isFinite(event.currentTarget.duration)
                        ? event.currentTarget.duration
                        : 0;
                      if (nextDuration > 0) {
                        setLoadedPreviewDuration(nextDuration);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                  No lesson video yet. Auto timing will still follow slide order, and exact time stamping becomes
                  available after a video is recorded or uploaded.
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-white bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <span>Lesson flow</span>
                  <span>
                    {effectiveDuration && effectiveDuration > 0
                      ? formatTimestampLabel(effectiveDuration)
                      : `${slides.length} slides`}
                  </span>
                </div>
                <div className="relative mt-6">
                  <div className="h-3 rounded-full bg-gray-100" />
                  {slides.length > 1 && (
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-1">
                      {slides.map((slide) => (
                        <span
                          key={`tick-${slide.id}`}
                          className="h-4 w-px bg-gray-300"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  )}
                  {timedActivities.map((timing, index) => (
                    <button
                      key={timing.task.id}
                      type="button"
                      onClick={() => seekPreviewVideo(timing.effectiveTimestampSeconds)}
                      className="absolute top-1/2 flex h-7 w-7 -translate-y-1/2 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-[11px] font-bold text-white shadow-md transition hover:scale-105 hover:bg-emerald-700"
                      style={{ left: `${timing.timelinePosition * 100}%` }}
                      title={`${timing.task.title_en || timing.task.title_ar || `Activity ${index + 1}`} · ${formatTimestampLabel(
                        timing.effectiveTimestampSeconds
                      )}`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {timedActivities.map((timing, index) => (
                    <button
                      key={`summary-${timing.task.id}`}
                      type="button"
                      onClick={() => seekPreviewVideo(timing.effectiveTimestampSeconds)}
                      className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-left hover:border-emerald-200 hover:bg-emerald-50/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {timing.task.title_en || timing.task.title_ar || `Activity ${index + 1}`}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {timing.timingMode === "manual"
                            ? "Manual time"
                            : `Auto from slide ${((timing.sourceSlide?.sequence ?? 0) || 0) + 1}`}
                        </p>
                      </div>
                      <span className="ml-3 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                        {formatTimestampLabel(timing.effectiveTimestampSeconds)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {activities.map((activity, index) => {
              const timing = activityTimingById.get(activity.id);
              const linkedSlide = timing?.sourceSlide ?? slides.find((slide) => slide.id === activity.linked_slide_id);
              return (
                <div key={activity.id} className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                          Activity {index + 1}
                        </span>
                        <span className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-gray-600">
                          {activity.task_type}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-gray-900">
                        {activity.title_en || activity.title_ar || linkedSlide?.title_en || linkedSlide?.title_ar || "Untitled activity"}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Linked slide: {linkedSlide?.title_en || linkedSlide?.title_ar || activity.linked_slide_id}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditSlide(activity.linked_slide_id)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Edit slide
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove this activity and its linked slide?")) {
                            onRemoveActivity(activity.id);
                          }
                        }}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove activity
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-gray-600">
                      Shows at {formatTimestampLabel(timing?.effectiveTimestampSeconds ?? activity.timestamp_seconds)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        timing?.timingMode === "manual"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {timing?.timingMode === "manual"
                        ? "Manual trigger"
                        : `Auto from slide ${((linkedSlide?.sequence ?? 0) || 0) + 1}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Timestamp (sec)</label>
                      <input
                        type="number"
                        value={activity.timestamp_seconds > 0 ? activity.timestamp_seconds : ""}
                        onChange={(event) =>
                          updateActivity(activity.id, {
                            timestamp_seconds: event.target.value ? Number(event.target.value) : 0,
                          })
                        }
                        placeholder={
                          timing ? `Auto (${formatTimestampLabel(timing.effectiveTimestampSeconds)})` : "Auto"
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => stampCurrentVideoTime(activity.id)}
                          disabled={!videoUrl}
                          className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Use current video time
                        </button>
                        <button
                          type="button"
                          onClick={() => updateActivity(activity.id, { timestamp_seconds: 0 })}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          Use slide order
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Points</label>
                      <input
                        type="number"
                        value={activity.points}
                        onChange={(event) => updateActivity(activity.id, { points: Number(event.target.value) })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Timeout (sec)</label>
                      <input
                        type="number"
                        value={activity.timeout_seconds ?? ""}
                        onChange={(event) =>
                          updateActivity(activity.id, {
                            timeout_seconds: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                        placeholder="No limit"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={activity.required}
                        onChange={(event) => updateActivity(activity.id, { required: event.target.checked })}
                        className="rounded"
                      />
                      Required
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={activity.is_skippable}
                        onChange={(event) => updateActivity(activity.id, { is_skippable: event.target.checked })}
                        className="rounded"
                      />
                      Skippable
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hiddenLegacyTasks.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {hiddenLegacyTasks.length} legacy task{hiddenLegacyTasks.length === 1 ? "" : "s"} remain for compatibility.
            They are preserved on save but not editable until their runtime UI is rebuilt.
          </div>
        )}
      </section>

      {showActivityPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowActivityPicker(false)}
        >
          <div
            className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Add Activity</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                Choose the interaction type. The linked activity slide will be created automatically.
              </p>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {ACTIVITY_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => {
                    setShowActivityPicker(false);
                    onAddActivity(option.type);
                  }}
                  className="group flex w-full items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50/60"
                >
                  <span className="mt-0.5 text-2xl">{option.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-emerald-800">
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{option.hint}</p>
                  </div>
                  <svg
                    className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setShowActivityPicker(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Content Tab ─── */

function ContentTab({
  lessonId,
  form,
  slides,
  questions,
  contentBlocks,
  setContentBlocks,
  setQuestions,
  setSlides,
  setLessonTasks,
  addContentBlock,
  contentGenerationBlockedReason,
  rebuildEmbeddings,
}: {
  lessonId: string;
  form: LessonForm;
  slides: Slide[];
  questions: QuestionForm[];
  contentBlocks: ContentBlock[];
  setContentBlocks: (blocks: ContentBlock[] | ((prev: ContentBlock[]) => ContentBlock[])) => void;
  setQuestions: (questions: QuestionForm[]) => void;
  setSlides: (slides: Slide[] | ((prev: Slide[]) => Slide[])) => void;
  setLessonTasks: (tasks: LessonTaskForm[] | ((prev: LessonTaskForm[]) => LessonTaskForm[])) => void;
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
              const newTasks = data.tasks.map((task) =>
                normalizeLessonTaskForm({
                  id: crypto.randomUUID(),
                  task_type: task.task_type,
                  title_ar: task.title_ar,
                  title_en: task.title_en,
                  instruction_ar: task.instruction_ar,
                  instruction_en: task.instruction_en,
                  timestamp_seconds: task.timestamp_seconds,
                  task_data: task.task_data,
                  timeout_seconds: null,
                  is_skippable: task.is_skippable,
                  required: true,
                  points: task.points,
                  display_order: task.timestamp_seconds,
                  linked_slide_id: null,
                })
              );
              const preservedSlides = slides.filter((slide) => !slide.activity_id);
              const slidesWithActivities = ensureSlidesForSupportedTasks(preservedSlides, newTasks);
              const syncedTasks = syncTaskFormsFromSlides(slidesWithActivities, newTasks);

              setSlides(slidesWithActivities);
              setLessonTasks(syncedTasks);
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

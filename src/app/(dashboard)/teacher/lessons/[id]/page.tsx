"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { useBackgroundVideoUpload } from "@/contexts/BackgroundVideoUploadContext";
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
import SlideCard from "@/components/slides/SlideCard";
import SimPlayer from "@/components/slides/SimPlayer";
import type { SimPayload } from "@/lib/sim.types";
import type { Slide, SlideInteractionType } from "@/lib/slides.types";
import {
  ACTIVITY_TYPE_OPTIONS,
  createDraftActivitySlide,
  createDuplicateActivitySlide,
  createDuplicatedActivityTask,
  ensureSlidesForSupportedTasks,
  getEffectiveActivityTimings,
  isCanonicalActivityTask,
  normalizeLessonTaskForm,
  syncTaskFormsFromSlides,
} from "@/lib/lesson-activities";
import ActivityTypeIcon from "@/components/ActivityTypeIcon";
import type { LessonTaskForm } from "@/lib/tasks.types";
import { toPlayableVideoUrl } from "@/lib/bunny-playback";
import { getLessonPublishReadiness } from "@/lib/lessons/publish-readiness";
import {
  getLessonVideoKey,
  type LessonVideoProcessingStatus,
  normalizeLessonVideoProcessingStatus,
} from "@/lib/lessons/video-processing";
import {
  clampSlideCount,
  DEFAULT_SLIDE_LENGTH_PRESET,
  getSlideGenerationContextStorageKey,
  getSlideLengthPresetConfig,
  getSlideLengthPresetFromCount,
  MIN_GENERATED_SLIDE_COUNT,
  MAX_GENERATED_SLIDE_COUNT,
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
  video_processing_status: LessonVideoProcessingStatus;
  video_processing_error: string;
  video_processed_at: string;
};

type Tab = "details" | "activities" | "slides" | "sim" | "results";
type EditorSaveState = "saved" | "dirty" | "saving" | "error";

type LessonVideoUrls = {
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  duration_seconds?: number;
  video_processing_status?: LessonVideoProcessingStatus;
  video_processing_error?: string | null;
  video_processed_at?: string | null;
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
    ...(urls.video_processing_status
      ? { video_processing_status: urls.video_processing_status }
      : {}),
    ...(urls.video_processing_error !== undefined
      ? { video_processing_error: urls.video_processing_error || "" }
      : {}),
    ...(urls.video_processed_at !== undefined
      ? { video_processed_at: urls.video_processed_at || "" }
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

function buildEditorSnapshot({
  form,
  assignedCohortIds,
  slides,
  lessonTasks,
  slideLanguageMode,
}: {
  form: LessonForm;
  assignedCohortIds: string[];
  slides: Slide[];
  lessonTasks: LessonTaskForm[];
  slideLanguageMode: SlideLanguageMode;
}) {
  const persistedForm = { ...form };
  delete persistedForm.video_processing_status;
  delete persistedForm.video_processing_error;
  delete persistedForm.video_processed_at;

  return JSON.stringify({
    form: persistedForm,
    assignedCohortIds: [...assignedCohortIds].sort(),
    slideLanguageMode,
    slides,
    lessonTasks,
  });
}

export default function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, loading: authLoading } = useTeacherGuard();
  const {
    activeLessonId: backgroundUploadLessonId,
    stage: backgroundUploadStage,
    statusMessage: backgroundUploadStatusMessage,
  } = useBackgroundVideoUpload();
  const [deleting, setDeleting] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [availableCohorts, setAvailableCohorts] = useState<CohortOption[]>([]);
  const [assignedCohortIds, setAssignedCohortIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<EditorSaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
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
  const lastPersistedVideoKeyRef = useRef("");
  const lastPersistedPublishedRef = useRef(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const hasInitializedSnapshotRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const [isRetryingVideoProcessing, setIsRetryingVideoProcessing] = useState(false);
  const [lessonSim, setLessonSim] = useState<SimPayload | null>(null);

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
    video_processing_status: "idle",
    video_processing_error: "",
    video_processed_at: "",
  });

  const [lessonTasks, setLessonTasks] = useState<LessonTaskForm[]>([]);

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

    const [{ data: lesson }, cohortResult, { data: existingAssignments }, slidesRes, simRes] = await Promise.all([
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
      fetch(`/api/teacher/lessons/${id}/sims`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    setLessonSim((simRes?.sim as SimPayload | null) ?? null);

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
      const initialForm: LessonForm = {
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
        video_processing_status: normalizeLessonVideoProcessingStatus(
          lesson.video_processing_status
        ),
        video_processing_error: lesson.video_processing_error || "",
        video_processed_at: lesson.video_processed_at || "",
      };
      setForm(initialForm);
      lastPersistedPublishedRef.current = lesson.is_published;
      lastPersistedVideoKeyRef.current = getLessonVideoKey(initialForm);
    }

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
      return newSlide.activity_id ?? null;
    },
    [lessonTasks, slides]
  );

  const handleDuplicateActivity = useCallback(
    (activityId: string) => {
      const sourceTask = lessonTasks.find((task) => task.id === activityId);
      if (!sourceTask) {
        return null;
      }

      const sourceSlide =
        slides.find((slide) => slide.id === sourceTask.linked_slide_id) ||
        slides.find((slide) => slide.activity_id === activityId) ||
        null;
      const duplicatedTaskBase = createDuplicatedActivityTask(sourceTask);
      const duplicatedSlide = sourceSlide
        ? createDuplicateActivitySlide(sourceSlide, duplicatedTaskBase.id)
        : null;
      const duplicatedTask: LessonTaskForm = {
        ...duplicatedTaskBase,
        linked_slide_id: duplicatedSlide?.id ?? null,
        display_order: sourceTask.display_order + 1,
      };

      const nextSlides = [...slides];
      if (duplicatedSlide && sourceSlide) {
        const sourceSlideIndex = nextSlides.findIndex(
          (slide) => slide.id === sourceSlide.id
        );
        nextSlides.splice(sourceSlideIndex + 1, 0, duplicatedSlide);
      }

      const normalizedSlides = nextSlides.map((slide, index) => ({
        ...slide,
        sequence: index,
      }));
      const syncedTasks = syncTaskFormsFromSlides(normalizedSlides, [
        ...lessonTasks,
        duplicatedTask,
      ]);

      setSlides(normalizedSlides);
      setLessonTasks(syncedTasks);
      if (duplicatedSlide) {
        setSlideEditorFocusId(duplicatedSlide.id);
      }

      return duplicatedTask.id;
    },
    [lessonTasks, slides]
  );

  const handleMoveActivity = useCallback(
    (activityId: string, direction: "up" | "down") => {
      const sourceTask = lessonTasks.find((task) => task.id === activityId);
      if (!sourceTask?.linked_slide_id) {
        return;
      }

      const orderedActivitySlides = lessonTasks
        .filter(
          (task) => task.linked_slide_id && isCanonicalActivityTask(task.task_type)
        )
        .map((task) => ({
          taskId: task.id,
          slide: slides.find((slide) => slide.id === task.linked_slide_id) || null,
        }))
        .filter(
          (entry): entry is { taskId: string; slide: Slide } => Boolean(entry.slide)
        )
        .sort((left, right) => left.slide.sequence - right.slide.sequence);

      const currentIndex = orderedActivitySlides.findIndex(
        (entry) => entry.taskId === activityId
      );
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (
        currentIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= orderedActivitySlides.length
      ) {
        return;
      }

      const sourceSlide = orderedActivitySlides[currentIndex].slide;
      const targetSlide = orderedActivitySlides[targetIndex].slide;
      const sourceSlideIndex = slides.findIndex((slide) => slide.id === sourceSlide.id);
      const targetSlideIndex = slides.findIndex((slide) => slide.id === targetSlide.id);

      if (sourceSlideIndex < 0 || targetSlideIndex < 0) {
        return;
      }

      const nextSlides = [...slides];
      [nextSlides[sourceSlideIndex], nextSlides[targetSlideIndex]] = [
        nextSlides[targetSlideIndex],
        nextSlides[sourceSlideIndex],
      ];

      const normalizedSlides = nextSlides.map((slide, index) => ({
        ...slide,
        sequence: index,
      }));
      const syncedTasks = syncTaskFormsFromSlides(normalizedSlides, lessonTasks);

      setSlides(normalizedSlides);
      setLessonTasks(syncedTasks);
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

  const processPublishedVideo = useCallback(
    async (successText: string, options?: { showMessage?: boolean }) => {
      const response = await fetch(`/api/teacher/lessons/${id}/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_hint: "ar" }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Video transcript processing failed");
      }

      setForm((previous) => ({
        ...previous,
        video_processing_status: "ready",
        video_processing_error: "",
        video_processed_at: new Date().toISOString(),
      }));

      const processedText =
        data.embedding_count > 0
          ? `${successText} Transcript and search index updated.`
          : `${successText} Transcript updated.`;

      if (options?.showMessage !== false) {
        setSaveMessage({ type: "success", text: processedText });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    },
    [id]
  );

  const handleSlideVideoReady = useCallback(
    async (urls: LessonVideoUrls) => {
      setForm((prev) => applyVideoUrlsToForm(prev, urls));
    },
    []
  );

  const slideGenerationBlockedReason = getCurriculumRequirementMessage(
    subjects.find((s) => s.id === form.subject_id) ?? null,
    form.grade_level,
    form.curriculum_topic
  );

  const selectedSubject = subjects.find((subject) => subject.id === form.subject_id) ?? null;
  const requiresCurriculum = hasMappedCurriculum(selectedSubject, form.grade_level);
  const hasLessonVideo = Boolean(getLessonVideoKey(form));
  const publishReadiness = useMemo(
    () =>
      getLessonPublishReadiness({
        subject: selectedSubject,
        gradeLevel: form.grade_level,
        curriculumTopic: form.curriculum_topic,
        slides,
        lessonTasks,
        video: form,
        videoProcessingStatus: form.video_processing_status,
        videoProcessingError: form.video_processing_error,
      }),
    [
      form,
      lessonTasks,
      selectedSubject,
      slides,
    ]
  );
  const canAutosave =
    Boolean(form.title_ar.trim() && form.subject_id) &&
    (!requiresCurriculum || Boolean(form.curriculum_topic));
  const editorSnapshot = useMemo(
    () =>
      buildEditorSnapshot({
        form,
        assignedCohortIds,
        slides,
        lessonTasks,
        slideLanguageMode,
      }),
    [assignedCohortIds, form, lessonTasks, slideLanguageMode, slides]
  );

  const saveAll = useCallback(
    async (options?: { showSuccessMessage?: boolean }) => {
      const showSuccessMessage = options?.showSuccessMessage !== false;
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }

      if (!form.title_ar.trim() || !form.subject_id) {
        setSaveState("error");
        setSaveMessage({ type: "error", text: "Title and subject are required." });
        return;
      }
      if (requiresCurriculum && !form.curriculum_topic) {
        setSaveState("error");
        setSaveMessage({ type: "error", text: "Select a curriculum topic before saving." });
        return;
      }
      if (form.is_published && !publishReadiness.canPublish) {
        setSaveState("error");
        setActiveTab("details");
        setSaveMessage({
          type: "error",
          text: publishReadiness.blockingReasons[0]?.message || "Resolve the publish blockers before publishing this lesson.",
        });
        return;
      }

      setSaving(true);
      setSaveState("saving");
      if (showSuccessMessage) {
        setSaveMessage(null);
      }
      const supabase = createClient();
      const user = await getCachedUser(supabase);

      if (!user) {
        setSaving(false);
        setSaveState("error");
        setSaveMessage({ type: "error", text: "You must be signed in to save." });
        return;
      }

      try {
        const normalizedCohortIds = Array.from(new Set(assignedCohortIds)).sort();

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

        const { error: deleteAssignmentsError } = await supabase
          .from("cohort_lessons")
          .delete()
          .eq("lesson_id", id);

        if (deleteAssignmentsError) {
          throw new Error("Class access: " + deleteAssignmentsError.message);
        }

        if (normalizedCohortIds.length > 0) {
          const { error: insertAssignmentsError } = await supabase
            .from("cohort_lessons")
            .insert(
              normalizedCohortIds.map((cohortId) => ({
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

        await syncLessonTasks(supabase, id, syncedTasks);
        const nextVideoKey = getLessonVideoKey(form);
        const normalizedVideoProcessingStatus = normalizeLessonVideoProcessingStatus(
          form.video_processing_status
        );
        const shouldProcessPublishedVideo =
          Boolean(form.is_published && nextVideoKey) &&
          (normalizedVideoProcessingStatus !== "ready" ||
            !lastPersistedPublishedRef.current ||
            lastPersistedVideoKeyRef.current !== nextVideoKey);

        if (shouldProcessPublishedVideo) {
          await processPublishedVideo(showSuccessMessage ? "Saved." : "Autosaved.", {
            showMessage: showSuccessMessage,
          });
          lastPersistedPublishedRef.current = true;
          lastPersistedVideoKeyRef.current = nextVideoKey;
        } else {
          lastPersistedPublishedRef.current = form.is_published;
          lastPersistedVideoKeyRef.current = nextVideoKey;
          if (showSuccessMessage) {
            setSaveMessage({ type: "success", text: "Saved" });
            setTimeout(() => setSaveMessage(null), 2000);
          }
        }

        const savedAt = new Date().toLocaleTimeString();
        lastSavedSnapshotRef.current = buildEditorSnapshot({
          form,
          assignedCohortIds: normalizedCohortIds,
          slides: slidesWithActivities,
          lessonTasks: syncedTasks,
          slideLanguageMode,
        });
        setLastSavedAt(savedAt);
        setSlideLastSaved(savedAt);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
      } finally {
        setSaving(false);
      }
    },
    [
      assignedCohortIds,
      form,
      id,
      lessonTasks,
      processPublishedVideo,
      publishReadiness,
      requiresCurriculum,
      slideLanguageMode,
      slides,
    ]
  );

  useEffect(() => {
    if (loading || authLoading) {
      return;
    }

    if (!hasInitializedSnapshotRef.current) {
      hasInitializedSnapshotRef.current = true;
      lastSavedSnapshotRef.current = editorSnapshot;
      setSaveState("saved");
      return;
    }

    if (editorSnapshot === lastSavedSnapshotRef.current) {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      if (!saving && saveState !== "error") {
        setSaveState("saved");
      }
      return;
    }

    if (!saving) {
      setSaveState("dirty");
    }

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    if (!canAutosave) {
      autosaveTimeoutRef.current = null;
      return;
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      if (!saving && editorSnapshot !== lastSavedSnapshotRef.current) {
        void saveAll({ showSuccessMessage: false });
      }
    }, 1200);

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [authLoading, canAutosave, editorSnapshot, loading, saveAll, saveState, saving]);

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  const handleRetryVideoProcessing = useCallback(async () => {
    if (!hasLessonVideo) {
      return;
    }

    setIsRetryingVideoProcessing(true);
    setForm((previous) => ({
      ...previous,
      video_processing_status: "processing",
      video_processing_error: "",
    }));
    try {
      await processPublishedVideo("Video processed.");
    } catch (error) {
      setForm((previous) => ({
        ...previous,
        video_processing_status: "error",
        video_processing_error:
          error instanceof Error ? error.message : "Video processing failed",
      }));
      setSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Video processing failed",
      });
    } finally {
      setIsRetryingVideoProcessing(false);
    }
  }, [hasLessonVideo, processPublishedVideo]);

  const isBackgroundUploadForLesson =
    backgroundUploadLessonId === id &&
    ["uploading", "processing", "saving", "error"].includes(backgroundUploadStage);
  const videoStatus = useMemo(() => {
    if (isBackgroundUploadForLesson) {
      if (backgroundUploadStage === "error") {
        return {
          tone: "red" as const,
          title: "Video upload needs attention",
          description: backgroundUploadStatusMessage || "The background upload failed before it could finish.",
          actionLabel: null,
        };
      }

      if (backgroundUploadStage === "uploading") {
        return {
          tone: "amber" as const,
          title: "Uploading video in the background",
          description:
            backgroundUploadStatusMessage ||
            "You can keep working in the dashboard while the recording uploads. Keep this tab open.",
          actionLabel: null,
        };
      }

      return {
        tone: "amber" as const,
        title: "Preparing video in the background",
        description:
          backgroundUploadStatusMessage ||
          "The recording is uploaded and the lesson is finishing video processing in the background.",
        actionLabel: null,
      };
    }

    if (hasLessonVideo) {
      const processingStatus = normalizeLessonVideoProcessingStatus(
        form.video_processing_status
      );

      if (processingStatus === "processing") {
        return {
          tone: "amber" as const,
          title: "Processing lesson video",
          description:
            "Transcript and search indexing are running for this lesson video. Publishing stays blocked until this finishes.",
          actionLabel: null,
        };
      }

      if (processingStatus === "error") {
        return {
          tone: "red" as const,
          title: "Lesson video needs attention",
          description:
            form.video_processing_error ||
            "Transcript or search processing failed. Retry it before publishing.",
          actionLabel: "Retry transcript + search",
        };
      }

      if (processingStatus === "pending") {
        return {
          tone: "amber" as const,
          title: "Lesson video attached",
          description:
            "Run transcript and search processing before publishing this lesson.",
          actionLabel: "Process video now",
        };
      }

      return {
        tone: "emerald" as const,
        title: form.is_published ? "Published lesson video ready" : "Lesson video ready",
        description: form.is_published
          ? "Transcript and search indexing are up to date for this lesson video. You can re-run processing if needed."
          : "Transcript and search indexing are ready. This lesson can now be published once the remaining checks pass.",
        actionLabel: "Retry transcript + search",
      };
    }

    return {
      tone: "gray" as const,
      title: "No lesson video yet",
      description:
        "Record or upload a video from the slide editor. Once saved, transcript and search indexing can run automatically for published lessons.",
      actionLabel: null,
    };
  }, [
    backgroundUploadStage,
    backgroundUploadStatusMessage,
    form.is_published,
    form.video_processing_error,
    form.video_processing_status,
    hasLessonVideo,
    isBackgroundUploadForLesson,
  ]);

  const saveStateMeta = useMemo(() => {
    if (saveState === "saving") {
      return { text: "Saving changes...", className: "text-emerald-600" };
    }
    if (saveState === "dirty") {
      return { text: "Unsaved changes", className: "text-amber-600" };
    }
    if (saveState === "error") {
      return { text: "Save needs attention", className: "text-red-600" };
    }
    return {
      text: lastSavedAt ? `All changes saved • ${lastSavedAt}` : "All changes saved",
      className: "text-gray-500",
    };
  }, [lastSavedAt, saveState]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "details", label: "Details" },
    {
      key: "activities",
      label: "Activities",
      count: lessonTasks.filter(
        (task) => task.linked_slide_id && isCanonicalActivityTask(task.task_type)
      ).length,
    },
    { key: "slides", label: "Slides", count: slides.length },
    { key: "sim", label: "Sim" },
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
                  onClick={() => {
                    if (!canPublishLesson) return;
                    if (!form.is_published && !publishReadiness.canPublish) {
                      setActiveTab("details");
                      setSaveState("error");
                      setSaveMessage({
                        type: "error",
                        text:
                          publishReadiness.blockingReasons[0]?.message ||
                          "Resolve the publish blockers before publishing this lesson.",
                      });
                      return;
                    }
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
              <div className="hidden min-w-[220px] text-right sm:block">
                <p className={`text-xs font-semibold ${saveStateMeta.className}`}>{saveStateMeta.text}</p>
                {saveMessage && (
                  <p
                    className={`mt-1 text-[11px] ${
                      saveMessage.type === "success" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {saveMessage.text}
                  </p>
                )}
              </div>
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
          canPublishLesson={canPublishLesson}
          videoStatus={videoStatus}
          onRetryVideoProcessing={hasLessonVideo ? handleRetryVideoProcessing : null}
          isRetryingVideoProcessing={isRetryingVideoProcessing}
          publishReadiness={publishReadiness}
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
                  <>
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
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Slides
                      </label>
                      <input
                        type="number"
                        min={MIN_GENERATED_SLIDE_COUNT}
                        max={MAX_GENERATED_SLIDE_COUNT}
                        value={slideCount}
                        onChange={(e) => {
                          const raw = parseInt(e.target.value, 10);
                          const clamped = clampSlideCount(raw);
                          setSlideCount(clamped);
                          setSlideLengthPreset(getSlideLengthPresetFromCount(clamped));
                          setSlideGenContext((prev) => ({
                            learningObjective: prev?.learningObjective || "",
                            keyIdeas: prev?.keyIdeas || [],
                            sourceNotes: prev?.sourceNotes || "",
                            lessonDurationMinutes: prev?.lessonDurationMinutes ?? null,
                            slideGoalMix: prev?.slideGoalMix || "balanced",
                            requestedSlideCount: clamped,
                          }));
                        }}
                        className="w-16 border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 focus:ring-0"
                      />
                    </div>
                  </>
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
                focusedSlideId={slideEditorFocusId}
              />
            )}
          </div>
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
            onDuplicateActivity={handleDuplicateActivity}
            onMoveActivity={handleMoveActivity}
            onRemoveActivity={handleRemoveActivity}
            onEditSlide={handleEditActivitySlide}
          />
        )}

        {activeTab === "sim" && (
          <div className="space-y-4">
            {lessonSim ? (
              <div className="bg-black rounded-lg overflow-hidden">
                <SimPlayer payload={lessonSim} language="ar" />
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
                <p className="text-sm text-gray-500">
                  No sim has been recorded for this lesson yet.
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  Open the Slides tab and press <span className="font-semibold">Sim β</span> in the editor toolbar to record one.
                </p>
              </div>
            )}
          </div>
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
  canPublishLesson,
  videoStatus,
  onRetryVideoProcessing,
  isRetryingVideoProcessing,
  publishReadiness,
}: {
  form: LessonForm;
  setForm: (f: LessonForm | ((prev: LessonForm) => LessonForm)) => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  availableCohorts: CohortOption[];
  assignedCohortIds: string[];
  setAssignedCohortIds: (value: string[] | ((prev: string[]) => string[])) => void;
  canPublishLesson: boolean;
  videoStatus: {
    tone: "gray" | "amber" | "emerald" | "red";
    title: string;
    description: string;
    actionLabel: string | null;
  };
  onRetryVideoProcessing: (() => void) | null;
  isRetryingVideoProcessing: boolean;
  publishReadiness: ReturnType<typeof getLessonPublishReadiness>;
}) {
  const videoToneClasses = {
    gray: "border-gray-200 bg-gray-50/70 text-gray-700",
    amber: "border-amber-200 bg-amber-50/70 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    red: "border-red-200 bg-red-50/70 text-red-800",
  } as const;

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

      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Lesson Video</h2>
            <p className="mt-2 text-sm text-gray-500">
              Recordings upload in the background and lesson video processing can be retried here if transcript or search indexing needs another pass.
            </p>
          </div>
          {videoStatus.actionLabel && onRetryVideoProcessing && (
            <button
              type="button"
              onClick={onRetryVideoProcessing}
              disabled={isRetryingVideoProcessing}
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetryingVideoProcessing ? "Processing..." : videoStatus.actionLabel}
            </button>
          )}
        </div>

        <div className={`rounded-2xl border px-4 py-4 ${videoToneClasses[videoStatus.tone]}`}>
          <p className="text-sm font-semibold">{videoStatus.title}</p>
          <p className="mt-1 text-sm opacity-90">{videoStatus.description}</p>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Publish Readiness
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Publishing is blocked until the lesson has a video, slides, curriculum topic, and finished transcript/search processing.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              publishReadiness.canPublish
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {publishReadiness.canPublish ? "Ready to publish" : "Needs attention"}
          </span>
        </div>

        {publishReadiness.blockingReasons.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-800">
            This lesson meets the current publish checks.
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
            <p className="text-sm font-semibold text-amber-900">
              Resolve these before publishing:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-amber-900">
              {publishReadiness.blockingReasons.map((reason) => (
                <li key={reason.code} className="flex gap-2">
                  <span className="mt-0.5 text-amber-600">•</span>
                  <span>{reason.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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

/* ─── Activities Tab ─── */

function ActivitiesTab({
  slides,
  lessonTasks,
  videoUrl,
  videoDurationSeconds,
  setLessonTasks,
  onAddActivity,
  onDuplicateActivity,
  onMoveActivity,
  onRemoveActivity,
  onEditSlide,
}: {
  slides: Slide[];
  lessonTasks: LessonTaskForm[];
  videoUrl: string;
  videoDurationSeconds: number | null;
  setLessonTasks: (tasks: LessonTaskForm[] | ((prev: LessonTaskForm[]) => LessonTaskForm[])) => void;
  onAddActivity: (interactionType: SlideInteractionType) => string | null;
  onDuplicateActivity: (activityId: string) => string | null;
  onMoveActivity: (activityId: string, direction: "up" | "down") => void;
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
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showActivityPicker, setShowActivityPicker] = useState(false);

  const updateActivity = useCallback((activityId: string, updates: Partial<LessonTaskForm>) => {
    setLessonTasks((current) =>
      current.map((task) => (task.id === activityId ? { ...task, ...updates } : task))
    );
  }, [setLessonTasks]);
  const effectiveSelectedActivityId = useMemo(() => {
    if (selectedActivityId && activities.some((activity) => activity.id === selectedActivityId)) {
      return selectedActivityId;
    }
    return activities[0]?.id ?? null;
  }, [activities, selectedActivityId]);

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

  const focusActivity = useCallback(
    (activityId: string, timeInSeconds?: number) => {
      setSelectedActivityId(activityId);
      if (typeof timeInSeconds === "number") {
        seekPreviewVideo(timeInSeconds);
      }
    },
    [seekPreviewVideo]
  );

  const selectedActivity =
    activities.find((activity) => activity.id === effectiveSelectedActivityId) ?? activities[0] ?? null;
  const selectedTiming = selectedActivity ? activityTimingById.get(selectedActivity.id) : null;
  const selectedLinkedSlide =
    selectedTiming?.sourceSlide ??
    (selectedActivity
      ? slides.find((slide) => slide.id === selectedActivity.linked_slide_id)
      : null);
  const selectedActivityIndex = selectedActivity
    ? activities.findIndex((activity) => activity.id === selectedActivity.id)
    : -1;
  const selectedSlideLanguage =
    selectedLinkedSlide?.title_ar ||
    selectedLinkedSlide?.body_ar ||
    selectedLinkedSlide?.interaction_prompt_ar
      ? "ar"
      : "en";
  const canMoveSelectedActivityUp = selectedActivityIndex > 0;
  const canMoveSelectedActivityDown =
    selectedActivityIndex >= 0 && selectedActivityIndex < activities.length - 1;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Activities {activities.length > 0 && <span className="text-gray-400">({activities.length})</span>}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage interactive checkpoints here. Use the activity rail to move between them quickly.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Activity Rail
              </p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">Add or jump to an activity</h3>
              <p className="mt-1 text-sm text-gray-500">
                Adding one creates the linked slide immediately. Use the rail to edit timing here or jump into the slide design when needed.
              </p>
              <button
                type="button"
                onClick={() => setShowActivityPicker(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Activity
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-sm text-amber-700">
                No activities yet. Create one from the button above to set up a linked activity slide.
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-2 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Activities
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {activities.length} checkpoint{activities.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {activities.map((activity, index) => {
                    const timing = activityTimingById.get(activity.id);
                    const linkedSlide =
                      timing?.sourceSlide ??
                      slides.find((slide) => slide.id === activity.linked_slide_id);
                    const isSelected = selectedActivity?.id === activity.id;

                    return (
                      <button
                        key={activity.id}
                        type="button"
                        onClick={() =>
                          focusActivity(activity.id, timing?.effectiveTimestampSeconds)
                        }
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50 shadow-sm"
                            : "border-gray-200 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Activity {index + 1}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                              {activity.title_en ||
                                activity.title_ar ||
                                linkedSlide?.title_en ||
                                linkedSlide?.title_ar ||
                                "Untitled activity"}
                            </p>
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {linkedSlide?.title_en ||
                                linkedSlide?.title_ar ||
                                activity.task_type}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                              {formatTimestampLabel(
                                timing?.effectiveTimestampSeconds ?? activity.timestamp_seconds
                              )}
                            </span>
                            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              {activity.task_type.replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hiddenLegacyTasks.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {hiddenLegacyTasks.length} legacy task{hiddenLegacyTasks.length === 1 ? "" : "s"} remain for compatibility.
                They are preserved on save but not editable until their runtime UI is rebuilt.
              </div>
            )}
          </aside>

          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Activity Timeline</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Leave the timestamp blank to place an activity automatically from its linked slide order.
                    Use the preview video or the activity rail to navigate to the right checkpoint.
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
                      onClick={() => focusActivity(timing.task.id, timing.effectiveTimestampSeconds)}
                      className={`absolute top-1/2 flex h-7 w-7 -translate-y-1/2 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md transition hover:scale-105 ${
                        selectedActivity?.id === timing.task.id
                          ? "bg-emerald-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
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
                      onClick={() => focusActivity(timing.task.id, timing.effectiveTimestampSeconds)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                        selectedActivity?.id === timing.task.id
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/60"
                      }`}
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

            {selectedActivity ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                        Activity {selectedActivityIndex + 1}
                      </span>
                      <span className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-gray-600">
                        {selectedActivity.task_type}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">
                      {selectedActivity.title_en ||
                        selectedActivity.title_ar ||
                        selectedLinkedSlide?.title_en ||
                        selectedLinkedSlide?.title_ar ||
                        "Untitled activity"}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Linked slide: {selectedLinkedSlide?.title_en || selectedLinkedSlide?.title_ar || selectedActivity.linked_slide_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const duplicatedActivityId = onDuplicateActivity(selectedActivity.id);
                        if (duplicatedActivityId) {
                          setSelectedActivityId(duplicatedActivityId);
                        }
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveActivity(selectedActivity.id, "up")}
                      disabled={!canMoveSelectedActivityUp}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveActivity(selectedActivity.id, "down")}
                      disabled={!canMoveSelectedActivityDown}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditSlide(selectedActivity.linked_slide_id)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Edit slide
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Remove this activity and its linked slide?")) {
                          onRemoveActivity(selectedActivity.id);
                        }
                      }}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-gray-600">
                    Shows at {formatTimestampLabel(selectedTiming?.effectiveTimestampSeconds ?? selectedActivity.timestamp_seconds)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-semibold ${
                      selectedTiming?.timingMode === "manual"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {selectedTiming?.timingMode === "manual"
                      ? "Manual trigger"
                      : `Auto from slide ${((selectedLinkedSlide?.sequence ?? 0) || 0) + 1}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Timestamp (sec)</label>
                    <input
                      type="number"
                      value={selectedActivity.timestamp_seconds > 0 ? selectedActivity.timestamp_seconds : ""}
                      onChange={(event) =>
                        updateActivity(selectedActivity.id, {
                          timestamp_seconds: event.target.value ? Number(event.target.value) : 0,
                        })
                      }
                      placeholder={
                        selectedTiming ? `Auto (${formatTimestampLabel(selectedTiming.effectiveTimestampSeconds)})` : "Auto"
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => stampCurrentVideoTime(selectedActivity.id)}
                        disabled={!videoUrl}
                        className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Use current video time
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActivity(selectedActivity.id, { timestamp_seconds: 0 })}
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
                      value={selectedActivity.points}
                      onChange={(event) => updateActivity(selectedActivity.id, { points: Number(event.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Timeout (sec)</label>
                    <input
                      type="number"
                      value={selectedActivity.timeout_seconds ?? ""}
                      onChange={(event) =>
                        updateActivity(selectedActivity.id, {
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
                      checked={selectedActivity.required}
                      onChange={(event) => updateActivity(selectedActivity.id, { required: event.target.checked })}
                      className="rounded"
                    />
                    Required
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedActivity.is_skippable}
                      onChange={(event) => updateActivity(selectedActivity.id, { is_skippable: event.target.checked })}
                      className="rounded"
                    />
                    Skippable
                  </label>
                </div>

                {selectedLinkedSlide && (
                  <div className="rounded-2xl border border-white/90 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                          Linked Slide Preview
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          This is the slide students will see in the video before the live activity overlay opens.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditSlide(selectedLinkedSlide.id)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Open in Slides
                      </button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                      <SlideCard
                        slide={selectedLinkedSlide}
                        language={selectedSlideLanguage}
                        className="!rounded-none !shadow-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                <h3 className="text-base font-semibold text-gray-900">No activity selected</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Create an activity from the left rail to start editing its timing and rules.
                </p>
              </div>
            )}
          </div>
        </div>
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
                    const createdActivityId = onAddActivity(option.type);
                    if (createdActivityId) {
                      setSelectedActivityId(createdActivityId);
                    }
                    setShowActivityPicker(false);
                  }}
                  className="group flex w-full items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50/60"
                >
                  <span className="mt-0.5 text-gray-500 group-hover:text-emerald-600"><ActivityTypeIcon name={option.icon} className="w-6 h-6" /></span>
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

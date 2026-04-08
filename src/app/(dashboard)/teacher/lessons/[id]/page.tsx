"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { useSimAccess } from "@/lib/hooks/useSimAccess";
import {
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
  getSupportedSubjectKey,
  hasMappedCurriculum,
  serializeCurriculumSelection,
  type CurriculumSelection,
} from "@/lib/curriculum";
import type { Database } from "@/lib/database.types";
import dynamic from "next/dynamic";
import SimOnboardingTour from "@/components/teacher/SimOnboardingTour";

const SlideEditor = dynamic(() => import("@/components/slides/SlideEditor"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
const SimPlayer = dynamic(() => import("@/components/slides/SimPlayer"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
const InteractionResultsPanel = dynamic(() => import("@/components/teacher/InteractionResultsPanel"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
import type { SimPayload } from "@/lib/sim.types";
import type { Slide } from "@/lib/slides.types";
import {
  ensureSlidesForSupportedTasks,
  normalizeLessonTaskForm,
  syncTaskFormsFromSlides,
} from "@/lib/lesson-activities";
import type { LessonTaskForm } from "@/lib/tasks.types";
import { getLessonPublishReadiness } from "@/lib/lessons/publish-readiness";
import { toast } from "sonner";
import {
  clampSlideCount,
  DEFAULT_SLIDE_LENGTH_PRESET,
  getSlideGenerationContextStorageKey,
  getSlideLengthPresetConfig,
  getSlideLengthPresetFromCount,
  parseSlideGenerationContext,
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
};

type Tab = "details" | "slides" | "sim" | "results";
type EditorSaveState = "saved" | "dirty" | "saving" | "error";

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
  return JSON.stringify({
    form,
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
  const { canAccessSims } = useSimAccess();
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
  const lastPersistedPublishedRef = useRef(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const hasInitializedSnapshotRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
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
      };
      setForm(initialForm);
      lastPersistedPublishedRef.current = lesson.is_published;
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
        toast.error("Save failed: " + (data.error || "Unknown error"));
      } else {
        setSlideLastSaved(new Date().toLocaleTimeString());
      }
    } catch { toast.error("Save failed"); }
    finally { setSlideSaving(false); }
  }, [id, lessonTasks, slideLanguageMode, slides]);


  const slideGenerationBlockedReason = getCurriculumRequirementMessage(
    subjects.find((s) => s.id === form.subject_id) ?? null,
    form.grade_level,
    form.curriculum_topic
  );

  const selectedSubject = subjects.find((subject) => subject.id === form.subject_id) ?? null;
  const requiresCurriculum = hasMappedCurriculum(selectedSubject, form.grade_level);
  const publishReadiness = useMemo(
    () =>
      getLessonPublishReadiness({
        subject: selectedSubject,
        gradeLevel: form.grade_level,
        curriculumTopic: form.curriculum_topic,
        slides,
        hasSim: !!lessonSim,
      }),
    [
      form,
      lessonSim,
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
        lastPersistedPublishedRef.current = form.is_published;
        if (showSuccessMessage) {
          setSaveMessage({ type: "success", text: "Saved" });
          setTimeout(() => setSaveMessage(null), 2000);
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
    { key: "slides", label: "Slides", count: slides.length },
    ...(canAccessSims ? [{ key: "sim" as Tab, label: "Sim" }] : []),
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
                  data-tour="publish-badge"
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
                      toast.error(data.error || "Failed to delete lesson");
                      return;
                    }
                    router.push("/teacher/lessons");
                  } catch {
                    toast.error("Failed to delete lesson");
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting || saving || (form.is_published && !canPublishLesson)}
                className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
                title={form.is_published && !canPublishLesson ? "Published lessons can only be deleted by an admin." : undefined}
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
                data-tour={tab.key === "slides" ? "slides-tab" : tab.key === "sim" ? "sim-tab" : undefined}
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
          publishReadiness={publishReadiness}
        />
        )}

        {activeTab === "slides" && (
          <div className="max-w-[1600px] mx-auto px-4 space-y-4">
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
                    Generate slides with AI to get started, or add them manually.
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
                focusedSlideId={slideEditorFocusId}
                onSimChange={setLessonSim}
                simEnabled={canAccessSims}
                regenerateProps={{
                  slideCount,
                  slideLengthPreset,
                  languageMode: slideLanguageMode,
                  generationContext: slideGenContext,
                  isGenerating: isGeneratingSlides,
                  disabledReason: slideGenerationBlockedReason,
                  onSlideLengthPresetChange: handleSlideLengthPresetChange,
                  onSlideCountChange: (count: number) => {
                    const clamped = clampSlideCount(count);
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
                  },
                  onGenerated: (newSlides) => setSlides(newSlides),
                  onGeneratingChange: (generating, progress) => {
                    setIsGeneratingSlides(generating);
                    setSlideGenProgress(progress);
                  },
                }}
              />
            )}
          </div>
        )}

        {activeTab === "sim" && (
          <div className="space-y-4">
            {lessonSim ? (
              <>
                <SimPlayer payload={lessonSim} language="ar" showTeacherNotes />
                <GenerateHomeworkButton lessonId={id} subjectId={form.subject_id} />
              </>
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

      <SimOnboardingTour segments={["lesson-editor", "sim-recording", "post-recording"]} />
    </div>
  );
}

/* ─── Generate Homework Button ─── */

function GenerateHomeworkButton({ lessonId, subjectId }: { lessonId: string; subjectId: string }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/generate-homework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();
      // The streaming route sends keep-alive spaces then "\n" + JSON
      const jsonStr = text.includes("\n") ? text.slice(text.lastIndexOf("\n") + 1) : text;
      const data = JSON.parse(jsonStr);

      if (data.error) {
        setError(data.error);
        return;
      }

      // Store prefill data in sessionStorage
      sessionStorage.setItem(
        `hw-prefill-${lessonId}`,
        JSON.stringify({
          questions: data.questions,
          title_ar: data.title_ar,
          title_en: data.title_en,
          subject_id: subjectId,
          lesson_id: lessonId,
        })
      );

      router.push(`/teacher/homework/create?lesson=${lessonId}&prefill=1`);
    } catch (err) {
      console.error("generate-homework error:", err);
      setError("Failed to generate homework. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">Generate Homework</p>
        <p className="text-xs text-gray-500">
          Auto-create homework questions from this lesson&apos;s slide content using AI
        </p>
      </div>
      <div className="flex items-center gap-3">
        {error && <p className="text-xs text-red-600 max-w-xs">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Generating...
            </>
          ) : (
            "Generate Homework"
          )}
        </button>
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
  publishReadiness: ReturnType<typeof getLessonPublishReadiness>;
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

      <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Publish Readiness
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Publishing is blocked until the lesson has a sim, slides, and a curriculum topic.
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

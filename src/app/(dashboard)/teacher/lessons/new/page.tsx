"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import {
  getSupportedSubjectKey,
  getCurriculumSelectionForLesson,
  hasMappedCurriculum,
  serializeCurriculumSelection,
  type CurriculumSelection,
} from "@/lib/curriculum";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { toast } from "sonner";
import { getLessonPublishReadiness } from "@/lib/lessons/publish-readiness";
import {
  type LessonVideoProcessingStatus,
  normalizeLessonVideoProcessingStatus,
} from "@/lib/lessons/video-processing";
import { getDisallowedLessonVideoFields } from "@/lib/lessons/video-url-guards";
import { TEACHER_GRADE_OPTIONS } from "@/lib/slides-generation";

type Subject = {
  id: string;
  name_ar: string;
  name_en: string;
};

type LessonForm = {
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  grade_level: number;
  subject_id: string;
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

type AutosaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 900;
const UNTITLED_DRAFT_TITLE = "Untitled Lesson Draft";

function getInitialForm(): LessonForm {
  return {
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    grade_level: 1,
    subject_id: "",
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
  };
}

function buildLessonFormFromRow(
  row: Database["public"]["Tables"]["lessons"]["Row"],
  lessonSubject: Subject | null
): LessonForm {
  const gradeLevel = TEACHER_GRADE_OPTIONS.includes(
    row.grade_level as (typeof TEACHER_GRADE_OPTIONS)[number]
  )
    ? row.grade_level
    : TEACHER_GRADE_OPTIONS[0];

  return {
    title_ar:
      row.title_ar && row.title_ar !== UNTITLED_DRAFT_TITLE ? row.title_ar : "",
    title_en:
      row.title_en && row.title_en !== UNTITLED_DRAFT_TITLE ? row.title_en : "",
    description_ar: row.description_ar || "",
    description_en: row.description_en || "",
    grade_level: gradeLevel,
    subject_id: lessonSubject ? row.subject_id || "" : "",
    curriculum_topic: getCurriculumSelectionForLesson(
      lessonSubject,
      gradeLevel,
      row.curriculum_topic
    ),
    is_published: row.is_published ?? false,
    thumbnail_url: row.thumbnail_url || "",
    video_url_1080p: row.video_url_1080p || "",
    video_url_360p: row.video_url_360p || "",
    video_url_480p: row.video_url_480p || "",
    video_url_720p: row.video_url_720p || "",
    captions_ar_url: row.captions_ar_url || "",
    captions_en_url: row.captions_en_url || "",
    video_duration_seconds: row.video_duration_seconds
      ? String(row.video_duration_seconds)
      : "",
    video_processing_status: normalizeLessonVideoProcessingStatus(
      row.video_processing_status
    ),
    video_processing_error: row.video_processing_error || "",
    video_processed_at: row.video_processed_at || "",
  };
}

function hasDraftContent(form: LessonForm) {
  return Boolean(
    form.title_ar.trim() ||
      form.title_en.trim() ||
      form.description_ar.trim() ||
      form.description_en.trim() ||
      form.subject_id ||
      form.curriculum_topic ||
      form.thumbnail_url.trim() ||
      form.video_url_1080p.trim() ||
      form.video_url_360p.trim() ||
      form.video_url_480p.trim() ||
      form.video_url_720p.trim() ||
      form.captions_ar_url.trim() ||
      form.captions_en_url.trim() ||
      form.video_duration_seconds.trim() ||
      form.is_published
  );
}

function getDraftPayload(form: LessonForm, fallbackSubjectId: string) {
  const resolvedTitle =
    form.title_ar.trim() || form.title_en.trim() || UNTITLED_DRAFT_TITLE;

  return {
    title_ar: form.title_ar.trim() || resolvedTitle,
    title_en: form.title_en.trim() || resolvedTitle,
    description_ar: form.description_ar.trim() || null,
    description_en: form.description_en.trim() || null,
    grade_level: form.grade_level,
    subject_id: form.subject_id || fallbackSubjectId,
    curriculum_topic: serializeCurriculumSelection(form.curriculum_topic),
    is_published: false,
    thumbnail_url: form.thumbnail_url.trim() || null,
    video_url_1080p: form.video_url_1080p.trim() || null,
    video_url_360p: form.video_url_360p.trim() || null,
    video_url_480p: form.video_url_480p.trim() || null,
    video_url_720p: form.video_url_720p.trim() || null,
    captions_ar_url: form.captions_ar_url.trim() || null,
    captions_en_url: form.captions_en_url.trim() || null,
    video_duration_seconds: form.video_duration_seconds
      ? Number(form.video_duration_seconds)
      : null,
  };
}

function getAutosaveMessage(status: AutosaveState, error: string) {
  if (status === "saving") return "Saving draft...";
  if (status === "saved") return "Draft autosaved";
  if (status === "error") return error || "Draft autosave failed";
  return "Draft autosaves to the database while you work";
}

function getLessonVideoKey(form: Pick<
  LessonForm,
  "video_url_1080p" | "video_url_360p" | "video_url_480p" | "video_url_720p"
>) {
  return [
    form.video_url_360p,
    form.video_url_480p,
    form.video_url_720p,
    form.video_url_1080p,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("|");
}

export default function NewLessonPage() {
  const { profile, loading: authLoading } = useTeacherGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftLessonId, setDraftLessonId] = useState<string | null>(draftParam);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [autosaveError, setAutosaveError] = useState("");
  const [form, setForm] = useState<LessonForm>(getInitialForm);
  const didHydrateDraftRef = useRef(false);
  const lastSavedDraftKeyRef = useRef("");

  useEffect(() => {
    setDraftLessonId(draftParam);
  }, [draftParam]);

  const loadPageData = useCallback(async () => {
    const supabase = createClient();
    const subjectPromise = supabase
      .from("subjects")
      .select("id, name_ar, name_en")
      .order("display_order");

    const draftPromise = draftParam
      ? supabase.from("lessons").select("*").eq("id", draftParam).single()
      : Promise.resolve({ data: null, error: null });

    const [{ data: subjectRows }, { data: draftLesson }] = await Promise.all([
      subjectPromise,
      draftPromise,
    ]);

    const supportedSubjects = (subjectRows || []).filter((subject) =>
      Boolean(getSupportedSubjectKey(subject))
    );
    setSubjects(supportedSubjects);

    if (draftLesson) {
      const draftSubject =
        supportedSubjects.find((subject) => subject.id === draftLesson.subject_id) ??
        null;
      const hydratedDraftForm = buildLessonFormFromRow(draftLesson, draftSubject);
      setForm(hydratedDraftForm);
      const existingDraftKey = JSON.stringify(
        getDraftPayload(
          hydratedDraftForm,
          draftLesson.subject_id || supportedSubjects?.[0]?.id || ""
        )
      );
      lastSavedDraftKeyRef.current = existingDraftKey;
    } else {
      lastSavedDraftKeyRef.current = "";
    }

    didHydrateDraftRef.current = true;
    setLoading(false);
  }, [draftParam]);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadPageData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadPageData]);

  const selectedSubject =
    subjects.find((subject) => subject.id === form.subject_id) ?? null;
  const requiresCurriculum = hasMappedCurriculum(
    selectedSubject,
    form.grade_level
  );
  const canPublishLesson = profile?.role === "admin";
  const publishReadiness = getLessonPublishReadiness({
    subject: selectedSubject,
    gradeLevel: form.grade_level,
    curriculumTopic: form.curriculum_topic,
    slides: [],
    lessonTasks: [],
    video: form,
    videoProcessingStatus: form.video_processing_status,
    videoProcessingError: form.video_processing_error,
  });

  useEffect(() => {
    if (authLoading || loading || !didHydrateDraftRef.current) return;
    if (!hasDraftContent(form)) {
      setAutosaveState("idle");
      setAutosaveError("");
      return;
    }

    const fallbackSubjectId = form.subject_id || subjects[0]?.id || "";
    if (!fallbackSubjectId) return;

    const draftPayload = getDraftPayload(form, fallbackSubjectId);
    const draftKey = JSON.stringify(draftPayload);
    if (draftKey === lastSavedDraftKeyRef.current) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        setAutosaveState("saving");
        setAutosaveError("");

        const supabase = createClient();
        const user = await getCachedUser(supabase);

        if (!user) {
          setAutosaveState("error");
          setAutosaveError("Sign in again to keep saving this draft.");
          return;
        }

        if (draftLessonId) {
          const { error } = await supabase
            .from("lessons")
            .update({
              ...draftPayload,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draftLessonId);

          if (error) {
            setAutosaveState("error");
            setAutosaveError(error.message);
            return;
          }
        } else {
          const { data: lesson, error } = await supabase
            .from("lessons")
            .insert({
              ...draftPayload,
              created_by: user.id,
            })
            .select("id")
            .single();

          if (error || !lesson) {
            setAutosaveState("error");
            setAutosaveError(error?.message || "Failed to create draft lesson.");
            return;
          }

          setDraftLessonId(lesson.id);
          router.replace(`/teacher/lessons/new?draft=${lesson.id}`, {
            scroll: false,
          });
        }

        lastSavedDraftKeyRef.current = draftKey;
        setAutosaveState("saved");
      })();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [authLoading, draftLessonId, form, loading, router, subjects]);

  async function saveLesson() {
    if (!form.title_ar.trim() || !form.subject_id) {
      toast.error("Please fill in the required fields.");
      return;
    }

    if (requiresCurriculum && !form.curriculum_topic) {
      toast.error("Select a curriculum topic before saving this lesson.");
      return;
    }

    const blockedVideoFields = getDisallowedLessonVideoFields({
      "Video URL 1080p": form.video_url_1080p,
      "Video URL 360p": form.video_url_360p,
      "Video URL 480p": form.video_url_480p,
      "Video URL 720p": form.video_url_720p,
    });
    if (blockedVideoFields.length > 0) {
      toast.error(
        `YouTube video links are not allowed. Use ad-free hosted video URLs instead. Blocked fields: ${blockedVideoFields.join(", ")}`
      );
      return;
    }

    if (form.is_published && !publishReadiness.canPublish) {
      toast.error(
        publishReadiness.blockingReasons
          .map((reason, index) => `${index + 1}. ${reason.message}`)
          .join("\n")
      );
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) {
      setSaving(false);
      router.push("/auth/login");
      return;
    }

    const payload = {
      title_ar: form.title_ar.trim(),
      title_en: form.title_en.trim() || form.title_ar.trim(),
      description_ar: form.description_ar.trim() || null,
      description_en: form.description_en.trim() || null,
      grade_level: form.grade_level,
      subject_id: form.subject_id,
      curriculum_topic: serializeCurriculumSelection(form.curriculum_topic),
      is_published: form.is_published,
      thumbnail_url: form.thumbnail_url.trim() || null,
      video_url_1080p: form.video_url_1080p.trim() || null,
      video_url_360p: form.video_url_360p.trim() || null,
      video_url_480p: form.video_url_480p.trim() || null,
      video_url_720p: form.video_url_720p.trim() || null,
      captions_ar_url: form.captions_ar_url.trim() || null,
      captions_en_url: form.captions_en_url.trim() || null,
      video_duration_seconds: form.video_duration_seconds
        ? Number(form.video_duration_seconds)
        : null,
    };

    const lessonQuery = draftLessonId
      ? supabase
          .from("lessons")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftLessonId)
          .select("id")
          .single()
      : supabase
          .from("lessons")
          .insert({
            ...payload,
            created_by: user.id,
          })
          .select("id")
          .single();

    const { data: lesson, error } = await lessonQuery;

    if (error || !lesson) {
      console.error("Failed to create lesson", error);
      setSaving(false);
      return;
    }

    lastSavedDraftKeyRef.current = JSON.stringify(
      getDraftPayload(form, form.subject_id)
    );

    if (payload.is_published && getLessonVideoKey(form)) {
      const processResponse = await fetch(`/api/teacher/lessons/${lesson.id}/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_hint: "ar" }),
      });

      if (!processResponse.ok) {
        const processData = await processResponse.json().catch(() => ({}));
        toast.warning(
          `Lesson saved, but transcript processing failed: ${
            processData.error || "Unknown error"
          }`
        );
      }
    }

    router.push(`/teacher/lessons/${lesson.id}`);
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const autosaveMessage = getAutosaveMessage(autosaveState, autosaveError);
  const autosaveClassName =
    autosaveState === "error"
      ? "text-red-600"
      : autosaveState === "saved"
        ? "text-emerald-600"
        : "text-gray-500";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <Link
            href="/teacher/lessons"
            className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block"
          >
            ← Back to Lessons
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create Lesson</h1>
          <p className={`mt-2 text-sm ${autosaveClassName}`}>{autosaveMessage}</p>
        </div>
        {draftLessonId && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Draft in progress
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Presentation Slides
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Save the lesson first, then generate the presentation deck from the
              lesson list or editor.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="px-4 py-2 bg-[#007229] text-white rounded-xl text-sm font-medium opacity-50 cursor-not-allowed"
          >
            Generate Presentation Slides
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (Arabic) *
            </label>
            <input
              value={form.title_ar}
              onChange={(e) =>
                setForm({ ...form, title_ar: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (English)
            </label>
            <input
              value={form.title_en}
              onChange={(e) =>
                setForm({ ...form, title_en: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject *
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grade Level *
            </label>
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
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
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
                title_ar: selection?.substrand || prev.title_ar,
                title_en: selection?.substrand || prev.title_en,
                description_ar: selection?.summary || prev.description_ar,
                description_en: selection?.summary || prev.description_en,
              }))
            }
          />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description (Arabic)
          </label>
          <textarea
            value={form.description_ar}
            onChange={(e) =>
              setForm({ ...form, description_ar: e.target.value })
            }
            rows={3}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description (English)
          </label>
          <textarea
            value={form.description_en}
            onChange={(e) =>
              setForm({ ...form, description_en: e.target.value })
            }
            rows={3}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Publish immediately
          </span>
          <button
            onClick={() => {
              if (!canPublishLesson) return;
              if (!form.is_published && !publishReadiness.canPublish) {
                toast.error(
                  publishReadiness.blockingReasons
                    .map((reason, index) => `${index + 1}. ${reason.message}`)
                    .join("\n")
                );
                return;
              }
              setForm({ ...form, is_published: !form.is_published });
            }}
            disabled={!canPublishLesson}
            className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
              form.is_published
                ? "bg-emerald-500 justify-end"
                : "bg-gray-200 justify-start"
            } ${!canPublishLesson ? "cursor-not-allowed opacity-60" : ""}`}
            title={!canPublishLesson ? "Only admins can publish lessons." : undefined}
          >
            <span className="w-4 h-4 bg-white rounded-full shadow" />
          </button>
        </div>
        {!canPublishLesson && (
          <p className="text-xs text-amber-600">
            New lessons created by teachers stay as drafts until an admin publishes them.
          </p>
        )}
        {canPublishLesson && !publishReadiness.canPublish && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
            <p className="font-semibold">Publish is blocked on this page.</p>
            <p className="mt-1">
              Save the lesson as a draft first, then add slides, record/upload a video, and finish transcript/search processing in the lesson editor.
            </p>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Draft rows stay unpublished until this step is completed.
          </p>
          <button
            onClick={saveLesson}
            disabled={saving}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : draftLessonId
                ? "Continue to Lesson Editor"
                : "Create Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}

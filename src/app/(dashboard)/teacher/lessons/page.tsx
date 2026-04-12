"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import {
  getSupportedSubjectKey,
  hasMappedCurriculum,
  serializeCurriculumSelection,
  type CurriculumSelection,
} from "@/lib/curriculum";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import {
  DEFAULT_SLIDE_LENGTH_PRESET,
  DEFAULT_SLIDE_GOAL_MIX,
  getSlideGenerationContextStorageKey,
  getSlideLengthPresetConfig,
  normalizeKeyIdeasInput,
  SLIDE_GOAL_MIX_OPTIONS,
  SLIDE_LENGTH_PRESET_OPTIONS,
  TEACHER_GRADE_OPTIONS,
  type SlideGoalMix,
  type SlideLengthPreset,
  type SlideLanguageMode,
} from "@/lib/slides-generation";
import SimOnboardingTour from "@/components/teacher/SimOnboardingTour";

type Subject = {
  id: string;
  name_ar: string;
  name_en: string;
};

type LessonRow = {
  id: string;
  title_ar: string;
  title_en: string;
  grade_level: number;
  is_published: boolean;
  submitted_for_review: boolean;
  subject: Subject | null;
  updated_at: string;
  slide_count: number;
  creator_name: string | null;
};

export default function TeacherLessonsPage() {
  const { loading: authLoading, profile } = useTeacherGuard();
  const isAdmin = profile?.role === "admin";
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [creatingSlidesDraft, setCreatingSlidesDraft] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState("");
  const [quickCreateForm, setQuickCreateForm] = useState({
    title: "",
    subject_id: "",
    grade_level: 1,
    curriculum_topic: null as CurriculumSelection | null,
    language_mode: "ar" as SlideLanguageMode,
    learning_objective: "",
    key_ideas: "",
    source_notes: "",
    length_preset: DEFAULT_SLIDE_LENGTH_PRESET as SlideLengthPreset,
    slide_goal_mix: DEFAULT_SLIDE_GOAL_MIX as SlideGoalMix,
  });

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const { data: subjectRows } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en")
      .order("display_order");
    setSubjects((subjectRows || []).filter((subject) => Boolean(getSupportedSubjectKey(subject))));

    const { data: lessonRows } = await supabase
      .from("lessons")
      .select(
        `
        id,
        title_ar,
        title_en,
        grade_level,
        is_published,
        submitted_for_review,
        updated_at,
        subject:subjects (
          id,
          name_ar,
          name_en
        ),
        lesson_slides (
          slides
        ),
        creator:profiles!created_by (
          full_name
        )
      `
      )
      .order("updated_at", { ascending: false });

    const mapped = (lessonRows || []).map((row) => {
      const slidesData = row.lesson_slides as unknown as
        | { slides: unknown[] | null }[]
        | null;
      const slideCount =
        slidesData && slidesData.length > 0 && Array.isArray(slidesData[0]?.slides)
          ? slidesData[0].slides.length
          : 0;
      const creatorData = row.creator as unknown as { full_name: string } | null;
      return {
        id: row.id,
        title_ar: row.title_ar,
        title_en: row.title_en,
        grade_level: row.grade_level,
        is_published: row.is_published,
        submitted_for_review: (row as Record<string, unknown>).submitted_for_review as boolean || false,
        subject: row.subject as Subject | null,
        updated_at: row.updated_at,
        slide_count: slideCount,
        creator_name: creatorData?.full_name || null,
      } as LessonRow;
    });

    setLessons(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadData]);

  const filtered = lessons.filter((lesson) => {
    const matchesSearch =
      !search ||
      lesson.title_ar.toLowerCase().includes(search.toLowerCase()) ||
      lesson.title_en.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || lesson.subject?.id === subjectFilter;
    const matchesGrade = gradeFilter === "all" || lesson.grade_level === Number(gradeFilter);
    return matchesSearch && matchesSubject && matchesGrade;
  });

  const quickCreateSubjectId = quickCreateForm.subject_id || subjects[0]?.id || "";
  const quickCreateSelectedSubject =
    subjects.find((subject) => subject.id === quickCreateSubjectId) ?? null;
  const quickCreateRequiresCurriculum = hasMappedCurriculum(
    quickCreateSelectedSubject,
    quickCreateForm.grade_level
  );
  const canQuickCreateSlides = subjects.length > 0;

  function openQuickCreateModal() {
    setQuickCreateError("");
    setQuickCreateForm({
      title: "",
      subject_id: subjects[0]?.id || "",
      grade_level: TEACHER_GRADE_OPTIONS[0],
      curriculum_topic: null,
      language_mode: "ar",
      learning_objective: "",
      key_ideas: "",
      source_notes: "",
      length_preset: DEFAULT_SLIDE_LENGTH_PRESET,
      slide_goal_mix: DEFAULT_SLIDE_GOAL_MIX,
    });
    setShowQuickCreateModal(true);
  }

  function closeQuickCreateModal() {
    if (creatingSlidesDraft) return;
    setShowQuickCreateModal(false);
    setQuickCreateError("");
  }

  async function handleQuickCreateSlides() {
    const title = quickCreateForm.curriculum_topic?.substrand.trim() || quickCreateForm.title.trim();

    if (quickCreateRequiresCurriculum && !quickCreateForm.curriculum_topic) {
      setQuickCreateError("Select a curriculum topic before generating slides.");
      return;
    }

    if (!title) {
      setQuickCreateError("Enter a lesson title.");
      return;
    }

    if (!quickCreateSubjectId) {
      setQuickCreateError("Select a subject before generating slides.");
      return;
    }

    if (!quickCreateForm.learning_objective.trim()) {
      setQuickCreateError("Add a learning objective before generating slides.");
      return;
    }

    setCreatingSlidesDraft(true);
    setQuickCreateError("");

    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) {
      setCreatingSlidesDraft(false);
      router.push("/auth/login");
      return;
    }

    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({
        title_ar: title,
        title_en: title,
        description_ar: quickCreateForm.curriculum_topic?.summary || null,
        description_en: quickCreateForm.curriculum_topic?.summary || null,
        grade_level: quickCreateForm.grade_level,
        subject_id: quickCreateSubjectId,
        curriculum_topic: serializeCurriculumSelection(quickCreateForm.curriculum_topic),
        is_published: false,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !lesson) {
      setQuickCreateError(error?.message || "Failed to create the draft lesson.");
      setCreatingSlidesDraft(false);
      return;
    }

    const lengthConfig = getSlideLengthPresetConfig(quickCreateForm.length_preset);

    const generationContext = {
      learningObjective: quickCreateForm.learning_objective.trim(),
      keyIdeas: normalizeKeyIdeasInput(quickCreateForm.key_ideas),
      sourceNotes: quickCreateForm.source_notes.trim(),
      lessonDurationMinutes: lengthConfig.lessonDurationMinutes,
      slideGoalMix: quickCreateForm.slide_goal_mix,
      requestedSlideCount: lengthConfig.slideCount,
    };

    window.sessionStorage.setItem(
      getSlideGenerationContextStorageKey(lesson.id),
      JSON.stringify(generationContext)
    );

    setCreatingSlidesDraft(false);
    setShowQuickCreateModal(false);
    router.push(
      `/teacher/lessons/${lesson.id}/slides?autogenerate=1&language=${quickCreateForm.language_mode}&source=quick-create`
    );
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lessons</h1>
          <p className="text-sm text-gray-500 mt-0.5">{lessons.length} lesson{lessons.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          type="button"
          data-tour="new-lesson-btn"
          onClick={openQuickCreateModal}
          disabled={!canQuickCreateSlides}
          className="px-4 py-2 bg-[#007229] text-white rounded-xl text-sm font-medium hover:bg-[#005C22] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Lesson
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lessons..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="">All subjects</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name_en}
            </option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="all">All grades</option>
          {TEACHER_GRADE_OPTIONS.map((grade) => (
            <option key={grade} value={grade}>
              Grade {grade}
            </option>
          ))}
        </select>
      </div>

      {/* Lesson list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No lessons match your filters.</p>
          {lessons.length === 0 && (
            <button
              type="button"
              onClick={openQuickCreateModal}
              className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Create your first lesson
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/teacher/lessons/${lesson.id}`}
              className="block bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all px-4 py-3.5 group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-[15px] font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                      {lesson.title_en || lesson.title_ar}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lesson.subject && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">
                        {lesson.subject.name_en || lesson.subject.name_ar}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                      Grade {lesson.grade_level}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        lesson.is_published
                          ? "bg-emerald-50 text-emerald-700"
                          : lesson.submitted_for_review
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {lesson.is_published ? "Published" : lesson.submitted_for_review ? "In Review" : "Draft"}
                    </span>
                    {lesson.slide_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-50 text-violet-700">
                        {lesson.slide_count} slide{lesson.slide_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isAdmin && lesson.creator_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700">
                        {lesson.creator_name}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 ml-1">
                      Updated {new Date(lesson.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Quick-create modal */}
      {showQuickCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeQuickCreateModal}
        >
          <div
            data-tour="quick-create-modal"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-gray-100 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Generate Presentation Slides</h2>
                <p className="text-sm text-gray-500 mt-1">
                  This creates a draft lesson automatically, then opens the slide generator.
                </p>
              </div>
              <button
                type="button"
                onClick={closeQuickCreateModal}
                disabled={creatingSlidesDraft}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                aria-label="Close slide generator setup"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    value={quickCreateSubjectId}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        subject_id: e.target.value,
                        curriculum_topic: null,
                        title: "",
                        learning_objective: "",
                        key_ideas: "",
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name_en} / {subject.name_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                  <select
                    value={quickCreateForm.grade_level}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        grade_level: Number(e.target.value),
                        curriculum_topic: null,
                        title: "",
                        learning_objective: "",
                        key_ideas: "",
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

              {quickCreateRequiresCurriculum ? (
                <div className="space-y-2">
                  <CurriculumTopicSelector
                    subject={quickCreateSelectedSubject}
                    gradeLevel={quickCreateForm.grade_level}
                    value={quickCreateForm.curriculum_topic}
                    onChange={(selection) =>
                      setQuickCreateForm((prev) => ({
                        ...prev,
                        curriculum_topic: selection,
                        title: selection?.substrand || "",
                        learning_objective: selection?.suggestedLearningObjective || "",
                        key_ideas: selection ? selection.suggestedKeyIdeas.join("\n") : "",
                      }))
                    }
                    disabled={creatingSlidesDraft}
                  />
                  <p className="text-xs text-gray-500">
                    The draft lesson title will be set from the selected curriculum topic.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Title</label>
                  <input
                    value={quickCreateForm.title}
                    onChange={(e) => setQuickCreateForm({ ...quickCreateForm, title: e.target.value })}
                    placeholder="For example: Fractions and Equal Parts"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning Objective</label>
                <input
                  value={quickCreateForm.learning_objective}
                  onChange={(e) =>
                    setQuickCreateForm({
                      ...quickCreateForm,
                      learning_objective: e.target.value,
                    })
                  }
                  placeholder="What should students understand by the end?"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key Ideas to Cover</label>
                <textarea
                  value={quickCreateForm.key_ideas}
                  onChange={(e) =>
                    setQuickCreateForm({
                      ...quickCreateForm,
                      key_ideas: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder={"One idea per line, or separate with commas\nExample: Equal parts\nNumerator and denominator\nComparing fractions"}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div data-tour="lesson-length-preset">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Length</label>
                  <select
                    value={quickCreateForm.length_preset}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        length_preset: e.target.value as SlideLengthPreset,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {SLIDE_LENGTH_PRESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {getSlideLengthPresetConfig(quickCreateForm.length_preset).description}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slide Language</label>
                  <select
                    value={quickCreateForm.language_mode}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        language_mode: e.target.value as SlideLanguageMode,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="ar">Arabic Slides</option>
                    <option value="en">English Slides</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slide Mix</label>
                  <select
                    value={quickCreateForm.slide_goal_mix}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        slide_goal_mix: e.target.value as SlideGoalMix,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {SLIDE_GOAL_MIX_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {
                      SLIDE_GOAL_MIX_OPTIONS.find((option) => option.value === quickCreateForm.slide_goal_mix)
                        ?.description
                    }
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={quickCreateForm.source_notes}
                  onChange={(e) =>
                    setQuickCreateForm({
                      ...quickCreateForm,
                      source_notes: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Paste a short outline, textbook notes, examples, or any must-cover content."
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {quickCreateError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{quickCreateError}</p>
              </div>
            )}

            <p className="text-[11px] text-gray-400 text-center">
              By creating content you agree that all materials become the property of Madrassa Sudan.
            </p>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={closeQuickCreateModal}
                disabled={creatingSlidesDraft}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-tour="create-draft-btn"
                onClick={handleQuickCreateSlides}
                disabled={creatingSlidesDraft || !canQuickCreateSlides}
                className="px-4 py-2 bg-[#007229] text-white rounded-xl text-sm font-medium hover:bg-[#005C22] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingSlidesDraft ? "Creating Draft Lesson..." : "Create Draft and Generate Slides"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content ownership notice */}
      <p className="mt-8 text-center text-xs text-gray-400">
        All content created on this platform is the property of Madrassa Sudan.
      </p>

      <SimOnboardingTour segments={["lesson-list"]} />
    </div>
  );
}

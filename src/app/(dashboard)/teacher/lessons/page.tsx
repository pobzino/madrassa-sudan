"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CurriculumTopicSelector from "@/components/teacher/CurriculumTopicSelector";
import {
  hasMappedCurriculum,
  serializeCurriculumSelection,
  type CurriculumSelection,
} from "@/lib/curriculum";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import {
  clampSlideCount,
  DEFAULT_SLIDE_GOAL_MIX,
  getSlideGenerationContextStorageKey,
  normalizeKeyIdeasInput,
  SLIDE_GOAL_MIX_OPTIONS,
  type SlideGoalMix,
  type SlideLanguageMode,
} from "@/lib/slides-generation";

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
  subject: Subject | null;
  updated_at: string;
};

export default function TeacherLessonsPage() {
  const { loading: authLoading } = useTeacherGuard();
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [slidesLessonId, setSlidesLessonId] = useState("");
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
    lesson_duration_minutes: 20,
    slide_goal_mix: DEFAULT_SLIDE_GOAL_MIX as SlideGoalMix,
    slide_count: 12,
  });

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const { data: subjectRows } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en")
      .order("display_order");
    setSubjects(subjectRows || []);

    const { data: lessonRows } = await supabase
      .from("lessons")
      .select(
        `
        id,
        title_ar,
        title_en,
        grade_level,
        is_published,
        updated_at,
        subject:subjects (
          id,
          name_ar,
          name_en
        )
      `
      )
      .order("updated_at", { ascending: false });

    setLessons((lessonRows || []) as LessonRow[]);
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
  const selectedSlidesLesson = filtered.find((lesson) => lesson.id === slidesLessonId) ?? filtered[0] ?? null;
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
      grade_level: 1,
      curriculum_topic: null,
      language_mode: "ar",
      learning_objective: "",
      key_ideas: "",
      source_notes: "",
      lesson_duration_minutes: 20,
      slide_goal_mix: DEFAULT_SLIDE_GOAL_MIX,
      slide_count: 12,
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

    const generationContext = {
      learningObjective: quickCreateForm.learning_objective.trim(),
      keyIdeas: normalizeKeyIdeasInput(quickCreateForm.key_ideas),
      sourceNotes: quickCreateForm.source_notes.trim(),
      lessonDurationMinutes: quickCreateForm.lesson_duration_minutes,
      slideGoalMix: quickCreateForm.slide_goal_mix,
      requestedSlideCount: clampSlideCount(quickCreateForm.slide_count),
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lesson Manager</h1>
          <p className="text-gray-500">Create and update lessons, questions, and content</p>
        </div>
        <Link
          href="/teacher/lessons/new"
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
        >
          New Lesson
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 grid gap-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lessons..."
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="">All subjects</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name_en} / {subject.name_ar}
            </option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="all">All grades</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
            <option key={grade} value={grade}>
              Grade {grade}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Presentation Slides</h2>
              <p className="text-sm text-gray-500">
                Start with slides first. This creates a draft lesson automatically, then opens the AI slide generator.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={openQuickCreateModal}
                disabled={!canQuickCreateSlides}
                className="px-4 py-2 bg-[#007229] text-white rounded-xl text-sm font-medium hover:bg-[#005C22] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Presentation Slides
              </button>
              <p className="text-xs text-gray-500">
                Add the objective, key ideas, notes, slide count, duration, and slide mix before generating.
              </p>
            </div>
            {!canQuickCreateSlides && (
              <p className="text-sm text-amber-700">
                Create a subject first before generating slides from a draft lesson.
              </p>
            )}
          </div>

          <div className="w-full xl:max-w-md rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Continue Existing Lesson Slides</h3>
              <p className="text-xs text-gray-500">
                Open the slide deck for a lesson that already exists.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedSlidesLesson?.id || ""}
                onChange={(e) => setSlidesLessonId(e.target.value)}
                disabled={filtered.length === 0}
                className="min-w-[260px] flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {filtered.length === 0 ? (
                  <option value="">No lessons match the current filters</option>
                ) : (
                  filtered.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.title_en || lesson.title_ar} · Grade {lesson.grade_level}
                    </option>
                  ))
                )}
              </select>
              {selectedSlidesLesson ? (
                <Link
                  href={`/teacher/lessons/${selectedSlidesLesson.id}/slides`}
                  className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors text-center"
                >
                  Open Slides
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 border border-gray-200 bg-white text-gray-400 rounded-xl text-sm font-medium cursor-not-allowed"
                >
                  Open Slides
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <span className="text-6xl mb-4 block">📚</span>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No lessons found</h2>
          <p className="text-gray-500 mb-4">Create a new lesson to get started.</p>
          <Link
            href="/teacher/lessons/new"
            className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Create Lesson
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((lesson) => (
            <div
              key={lesson.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {lesson.title_en || lesson.title_ar}
                </h3>
                <div className="text-sm text-gray-500 flex flex-wrap gap-3 mt-1">
                  <span>{lesson.subject?.name_en || lesson.subject?.name_ar || "Subject"}</span>
                  <span>Grade {lesson.grade_level}</span>
                  <span>{lesson.is_published ? "Published" : "Draft"}</span>
                  <span>Updated {new Date(lesson.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/teacher/lessons/${lesson.id}`}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Edit
                </Link>
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showQuickCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeQuickCreateModal}
        >
          <div
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    value={quickCreateSubjectId}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        subject_id: e.target.value,
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
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                      <option key={grade} value={grade}>
                        Grade {grade}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Duration</label>
                  <select
                    value={quickCreateForm.lesson_duration_minutes}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        lesson_duration_minutes: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {[10, 15, 20, 30, 45].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slides</label>
                  <input
                    type="number"
                    min={10}
                    max={20}
                    value={quickCreateForm.slide_count}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        slide_count: clampSlideCount(Number(e.target.value)),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language Focus</label>
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
                    <option value="ar">Arabic First</option>
                    <option value="en">English First</option>
                    <option value="both">Balanced Bilingual</option>
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

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Notes</label>
                  <textarea
                    value={quickCreateForm.source_notes}
                    onChange={(e) =>
                      setQuickCreateForm({
                        ...quickCreateForm,
                        source_notes: e.target.value,
                      })
                    }
                    rows={5}
                    placeholder="Paste a short outline, textbook notes, examples, or any must-cover content."
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slide Goal Mix</label>
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
                  <p className="mt-2 text-xs text-gray-500">
                    {
                      SLIDE_GOAL_MIX_OPTIONS.find((option) => option.value === quickCreateForm.slide_goal_mix)
                        ?.description
                    }
                  </p>
                </div>
              </div>
            </div>

            {quickCreateError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{quickCreateError}</p>
              </div>
            )}

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
    </div>
  );
}

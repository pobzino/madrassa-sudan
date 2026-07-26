"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

const LESSONS_PER_WEEK = 2;

interface SubjectRow {
  id: string;
  name_ar: string | null;
  name_en: string | null;
}

interface LessonItem {
  id: string;
  title: string;
}

interface StepPracticeInfo {
  stepId: string;
  practiceAssignmentId: string | null;
}

export default function LearningPathEditorPage() {
  const { loading: authLoading } = useTeacherGuard();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [ordered, setOrdered] = useState<LessonItem[]>([]);
  const [available, setAvailable] = useState<LessonItem[]>([]);
  const [loadingPath, setLoadingPath] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // lessonId -> saved step + its practice; used for the Generate/Vet controls.
  const [stepByLesson, setStepByLesson] = useState<Record<string, StepPracticeInfo>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // Load subjects that actually have published lessons.
  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    (async () => {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("subject_id")
        .eq("is_published", true);
      const subjectIds = new Set(
        (lessons || []).map((l) => l.subject_id).filter(Boolean) as string[]
      );
      const { data: subjectRows } = await supabase
        .from("subjects")
        .select("id, name_ar, name_en")
        .order("display_order");
      const withLessons = (subjectRows || []).filter((s) => subjectIds.has(s.id));
      setSubjects(withLessons);
      if (withLessons.length > 0) setSelectedSubject(withLessons[0].id);
    })();
  }, [authLoading]);

  const loadPath = useCallback(async (subjectId: string) => {
    if (!subjectId) return;
    setLoadingPath(true);
    setDirty(false);
    const supabase = createClient();
    const db = supabase as unknown as SupabaseClient;

    // All published lessons for this subject (title lookup + "available" pool).
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, title_ar, title_en")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    const titleById = new Map(
      (lessonRows || []).map((l) => [
        l.id,
        l.title_ar || l.title_en || "Untitled lesson",
      ])
    );

    // The published path and its ordered lessons.
    const { data: path } = await db
      .from("learning_paths")
      .select("id")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .maybeSingle<{ id: string }>();

    let orderedIds: string[] = [];
    setStepByLesson({});
    if (path) {
      const { data: weeks } = await db
        .from("learning_path_weeks")
        .select("id, week_number")
        .eq("path_id", path.id)
        .order("week_number", { ascending: true })
        .returns<Array<{ id: string; week_number: number }>>();
      const weekOrder = new Map((weeks ?? []).map((w, i) => [w.id, i]));

      if (weeks && weeks.length > 0) {
        const { data: steps } = await db
          .from("learning_path_steps")
          .select("id, week_id, lesson_id, sequence, practice_assignment_id")
          .in(
            "week_id",
            weeks.map((w) => w.id)
          )
          .returns<Array<{ id: string; week_id: string; lesson_id: string; sequence: number; practice_assignment_id: string | null }>>();
        const stepMap: Record<string, StepPracticeInfo> = {};
        for (const st of steps ?? []) {
          stepMap[st.lesson_id] = { stepId: st.id, practiceAssignmentId: st.practice_assignment_id };
        }
        setStepByLesson(stepMap);
        orderedIds = (steps ?? [])
          .slice()
          .sort((a, b) => {
            const wa = weekOrder.get(a.week_id) ?? 0;
            const wb = weekOrder.get(b.week_id) ?? 0;
            return wa !== wb ? wa - wb : a.sequence - b.sequence;
          })
          .map((s) => s.lesson_id)
          // Keep only lessons that still exist & are published.
          .filter((id) => titleById.has(id));
      }
    }

    const inPath = new Set(orderedIds);
    setOrdered(orderedIds.map((id) => ({ id, title: titleById.get(id) || "Lesson" })));
    setAvailable(
      (lessonRows || [])
        .filter((l) => !inPath.has(l.id))
        .map((l) => ({ id: l.id, title: titleById.get(l.id) || "Lesson" }))
    );
    setLoadingPath(false);
  }, []);

  useEffect(() => {
    if (selectedSubject) void loadPath(selectedSubject);
  }, [selectedSubject, loadPath]);

  const move = (index: number, delta: number) => {
    setOrdered((prev) => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const removeAt = (index: number) => {
    setOrdered((prev) => {
      const item = prev[index];
      if (item) setAvailable((a) => [{ ...item }, ...a]);
      return prev.filter((_, i) => i !== index);
    });
    setDirty(true);
  };

  const addLesson = (lesson: LessonItem) => {
    setOrdered((prev) => [...prev, lesson]);
    setAvailable((prev) => prev.filter((l) => l.id !== lesson.id));
    setDirty(true);
  };

  const generatePractice = async (lessonId: string) => {
    const info = stepByLesson[lessonId];
    if (!info) return;
    setGeneratingFor(lessonId);
    try {
      const res = await fetch("/api/teacher/learning-path/generate-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: info.stepId, num_questions: 10 }),
      });
      const text = await res.text();
      const lastLine = text.trim().split("\n").pop() ?? "";
      const data = JSON.parse(lastLine) as { assignment_id?: string; error?: string };
      if (!res.ok || data.error || !data.assignment_id) {
        toast.error("Practice generation failed: " + (data.error || "Unknown error"));
      } else {
        setStepByLesson((prev) => ({
          ...prev,
          [lessonId]: { ...info, practiceAssignmentId: data.assignment_id! },
        }));
        toast.success("Practice generated — review the questions before students see them");
      }
    } catch {
      toast.error("Practice generation failed");
    } finally {
      setGeneratingFor(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/learning-path", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: selectedSubject,
          ordered_lesson_ids: ordered.map((l) => l.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Save failed: " + (data.error || "Unknown error"));
      } else {
        toast.success("Learning path saved");
        setDirty(false);
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Learning Path</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Set the order students move through lessons. Every {LESSONS_PER_WEEK} lessons make a week,
          and each week ends with its test.
        </p>
      </div>

      {/* Subject selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Subject</label>
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
        >
          {subjects.length === 0 && <option value="">No subjects with lessons</option>}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_en || s.name_ar}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {loadingPath ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* Ordered path */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Path order</h2>
            {ordered.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                No lessons on the path yet. Add lessons below.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ordered.map((lesson, i) => {
                  const weekNumber = Math.floor(i / LESSONS_PER_WEEK) + 1;
                  const startsWeek = i % LESSONS_PER_WEEK === 0;
                  return (
                    <li key={lesson.id}>
                      {startsWeek && (
                        <div className="flex items-center gap-2 mt-3 first:mt-0 mb-1.5">
                          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                            Week {weekNumber}
                          </span>
                          <div className="flex-1 h-px bg-emerald-100" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="w-6 text-center text-xs font-semibold text-gray-400">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm text-gray-800 truncate">{lesson.title}</span>
                        {stepByLesson[lesson.id] ? (
                          generatingFor === lesson.id ? (
                            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-600">
                              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-600" />
                              Generating…
                            </span>
                          ) : stepByLesson[lesson.id].practiceAssignmentId ? (
                            <span className="flex items-center gap-1">
                              <a
                                href={`/teacher/homework/create?assignment=${stepByLesson[lesson.id].practiceAssignmentId}`}
                                className="px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                                title="Review and edit the practice questions"
                              >
                                ✓ Practice · Vet
                              </a>
                              <button
                                onClick={() => generatePractice(lesson.id)}
                                disabled={generatingFor !== null}
                                className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                                title="Regenerate questions from the lesson"
                              >
                                ↻
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => generatePractice(lesson.id)}
                              disabled={generatingFor !== null}
                              className="px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-40"
                              title="Generate ~10 auto-marked questions from this lesson"
                            >
                              ⚡ Generate practice
                            </button>
                          )
                        ) : (
                          <span className="px-2 py-1 text-[11px] text-gray-300" title="Save the path first to enable practice generation">
                            save first
                          </span>
                        )}
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === ordered.length - 1}
                          className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeAt(i)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          aria-label="Remove from path"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Available lessons */}
          {available.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Not on the path</h2>
              <p className="text-xs text-gray-500 mb-3">Published lessons you can add to the end.</p>
              <ul className="space-y-1.5">
                {available.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
                  >
                    <span className="flex-1 text-sm text-gray-700 truncate">{lesson.title}</span>
                    <button
                      onClick={() => addLesson(lesson)}
                      className="px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

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
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading]);

  async function loadData() {
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
  }

  const filtered = lessons.filter((lesson) => {
    const matchesSearch =
      !search ||
      lesson.title_ar.toLowerCase().includes(search.toLowerCase()) ||
      lesson.title_en.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || lesson.subject?.id === subjectFilter;
    const matchesGrade = gradeFilter === "all" || lesson.grade_level === Number(gradeFilter);
    return matchesSearch && matchesSubject && matchesGrade;
  });

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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

type Subject = {
  id: string;
  name_ar: string;
  name_en: string;
};

export default function NewLessonPage() {
  const { loading: authLoading } = useTeacherGuard();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    grade_level: 1,
    subject_id: "",
    is_published: false,
    thumbnail_url: "",
    video_url_360p: "",
    video_url_480p: "",
    video_url_720p: "",
    captions_ar_url: "",
    captions_en_url: "",
    video_duration_seconds: "",
  });

  useEffect(() => {
    if (!authLoading) {
      loadSubjects();
    }
  }, [authLoading]);

  async function loadSubjects() {
    const supabase = createClient();
    const { data } = await supabase.from("subjects").select("id, name_ar, name_en").order("display_order");
    setSubjects(data || []);
    setLoading(false);
  }

  async function saveLesson() {
    if (!form.title_ar.trim() || !form.subject_id) {
      alert("Please fill in the required fields.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({
        title_ar: form.title_ar.trim(),
        title_en: form.title_en.trim(),
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        grade_level: form.grade_level,
        subject_id: form.subject_id,
        is_published: form.is_published,
        thumbnail_url: form.thumbnail_url.trim() || null,
        video_url_360p: form.video_url_360p.trim() || null,
        video_url_480p: form.video_url_480p.trim() || null,
        video_url_720p: form.video_url_720p.trim() || null,
        captions_ar_url: form.captions_ar_url.trim() || null,
        captions_en_url: form.captions_en_url.trim() || null,
        video_duration_seconds: form.video_duration_seconds
          ? Number(form.video_duration_seconds)
          : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !lesson) {
      console.error("Failed to create lesson", error);
      setSaving(false);
      return;
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/teacher/lessons" className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block">
            ← Back to Lessons
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create Lesson</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (Arabic) *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
            <select
              value={form.subject_id}
              onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level *</label>
            <select
              value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>
        </div>

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

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Publish immediately</span>
          <button
            onClick={() => setForm({ ...form, is_published: !form.is_published })}
            className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
              form.is_published ? "bg-emerald-500 justify-end" : "bg-gray-200 justify-start"
            }`}
          >
            <span className="w-4 h-4 bg-white rounded-full shadow" />
          </button>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={saveLesson}
            disabled={saving}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Create Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

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
  subject_id: string;
  grade_level: number;
  is_published: boolean;
  thumbnail_url: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  captions_ar_url: string;
  captions_en_url: string;
  video_duration_seconds: string;
};

type QuestionForm = {
  id: string;
  question_type: "multiple_choice" | "true_false" | "fill_blank";
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

export default function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading: authLoading } = useTeacherGuard();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLesson, setSavingLesson] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(null);

  const [form, setForm] = useState<LessonForm>({
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    subject_id: "",
    grade_level: 1,
    is_published: false,
    thumbnail_url: "",
    video_url_360p: "",
    video_url_480p: "",
    video_url_720p: "",
    captions_ar_url: "",
    captions_en_url: "",
    video_duration_seconds: "",
  });

  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);

  useEffect(() => {
    if (!authLoading) {
      loadLesson();
    }
  }, [id, authLoading]);

  async function loadLesson() {
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const { data: subjectRows } = await supabase
      .from("subjects")
      .select("id, name_ar, name_en")
      .order("display_order");
    setSubjects(subjectRows || []);

    const { data: lesson } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", id)
      .single();

    if (lesson) {
      setForm({
        title_ar: lesson.title_ar || "",
        title_en: lesson.title_en || "",
        description_ar: lesson.description_ar || "",
        description_en: lesson.description_en || "",
        subject_id: lesson.subject_id || "",
        grade_level: lesson.grade_level || 1,
        is_published: lesson.is_published,
        thumbnail_url: lesson.thumbnail_url || "",
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
      points: q.points || 10,
      timestamp_seconds: q.timestamp_seconds || 0,
      is_required: q.is_required ?? true,
      allow_retry: q.allow_retry ?? true,
    }));
    setQuestions(questionForms);

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
  }

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

  async function saveLesson() {
    if (!form.title_ar.trim() || !form.subject_id) {
      alert("Title and subject are required.");
      return;
    }
    setSavingLesson(true);
    const supabase = createClient();
    await supabase
      .from("lessons")
      .update({
        title_ar: form.title_ar.trim(),
        title_en: form.title_en.trim(),
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        subject_id: form.subject_id,
        grade_level: form.grade_level,
        is_published: form.is_published,
        thumbnail_url: form.thumbnail_url.trim() || null,
        video_url_360p: form.video_url_360p.trim() || null,
        video_url_480p: form.video_url_480p.trim() || null,
        video_url_720p: form.video_url_720p.trim() || null,
        captions_ar_url: form.captions_ar_url.trim() || null,
        captions_en_url: form.captions_en_url.trim() || null,
        video_duration_seconds: form.video_duration_seconds ? Number(form.video_duration_seconds) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSavingLesson(false);
  }

  async function saveQuestions() {
    if (questions.length === 0) return;
    setSavingQuestions(true);
    const supabase = createClient();
    await supabase.from("lesson_questions").delete().eq("lesson_id", id);
    const rows = questions.map((q, index) => ({
      lesson_id: id,
      question_type: q.question_type,
      question_text_ar: q.question_text_ar,
      question_text_en: q.question_text_en || null,
      options: q.question_type === "fill_blank" ? null : q.options.filter((opt) => opt.trim()),
      correct_answer: q.correct_answer,
      explanation_ar: null,
      explanation_en: null,
      is_required: q.is_required,
      allow_retry: q.allow_retry,
      display_order: index + 1,
      timestamp_seconds: q.timestamp_seconds || 0,
    }));
    await supabase.from("lesson_questions").insert(rows);
    setSavingQuestions(false);
  }

  async function saveContentBlocks() {
    setSavingBlocks(true);
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
    setSavingBlocks(false);
  }

  async function rebuildEmbeddings() {
    setEmbeddingStatus("Embedding...");
    const response = await fetch("/api/teacher/lessons/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setEmbeddingStatus(data.error || "Failed to embed");
      return;
    }
    setEmbeddingStatus(`Embedded ${data.count || 0} chunks.`);
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/teacher/lessons" className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block">
            ← Back to Lessons
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit Lesson</h1>
        </div>
        <button
          onClick={saveLesson}
          disabled={savingLesson}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          {savingLesson ? "Saving..." : "Save Lesson"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Lesson Basics</h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
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

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Thumbnail URL</label>
            <input
              value={form.thumbnail_url}
              onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Video URL 360p</label>
            <input
              value={form.video_url_360p}
              onChange={(e) => setForm({ ...form, video_url_360p: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Video URL 480p</label>
            <input
              value={form.video_url_480p}
              onChange={(e) => setForm({ ...form, video_url_480p: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Video URL 720p</label>
            <input
              value={form.video_url_720p}
              onChange={(e) => setForm({ ...form, video_url_720p: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Captions (Arabic)</label>
            <input
              value={form.captions_ar_url}
              onChange={(e) => setForm({ ...form, captions_ar_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Captions (English)</label>
            <input
              value={form.captions_en_url}
              onChange={(e) => setForm({ ...form, captions_en_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Published</span>
          <button
            onClick={() => setForm({ ...form, is_published: !form.is_published })}
            className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
              form.is_published ? "bg-emerald-500 justify-end" : "bg-gray-200 justify-start"
            }`}
          >
            <span className="w-4 h-4 bg-white rounded-full shadow" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Lesson Questions</h2>
          <button
            onClick={addQuestion}
            className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Add Question
          </button>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-gray-500">No questions yet.</p>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Question {index + 1}</h3>
                  <button
                    onClick={() => removeQuestion(question.id)}
                    className="text-sm text-red-600 hover:text-red-700"
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

                <div className="grid md:grid-cols-4 gap-3">
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
                      <option value="fill_blank">Fill in the Blank</option>
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

                {question.question_type !== "fill_blank" && (
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
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={question.is_required}
                      onChange={(e) => updateQuestion(question.id, { is_required: e.target.checked })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={question.allow_retry}
                      onChange={(e) => updateQuestion(question.id, { allow_retry: e.target.checked })}
                    />
                    Allow retry
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={saveQuestions}
            disabled={savingQuestions}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {savingQuestions ? "Saving..." : "Save Questions"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Lesson Content Blocks</h2>
          <div className="flex gap-2">
            <button
              onClick={() => addContentBlock("ar")}
              className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Add Arabic
            </button>
            <button
              onClick={() => addContentBlock("en")}
              className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Add English
            </button>
          </div>
        </div>

        {contentBlocks.length === 0 ? (
          <p className="text-sm text-gray-500">No content blocks yet.</p>
        ) : (
          <div className="space-y-4">
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
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => setContentBlocks(contentBlocks.filter((_, idx) => idx !== index))}
                    className="text-sm text-red-600 hover:text-red-700"
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

        <div className="flex items-center justify-between">
          <button
            onClick={saveContentBlocks}
            disabled={savingBlocks}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {savingBlocks ? "Saving..." : "Save Content Blocks"}
          </button>
          <button
            onClick={rebuildEmbeddings}
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Rebuild Embeddings
          </button>
        </div>
        {embeddingStatus && <p className="text-sm text-gray-500">{embeddingStatus}</p>}
      </div>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import type { HomeworkAssignment, HomeworkQuestion } from "@/lib/homework.types";

/**
 * Printable, pen-and-paper worksheet for a homework assignment.
 *
 * Built for refugee-camp lessons where students work on paper: renders the
 * questions with blank answer space (no correct answers) and prints cleanly via
 * a "print only this element" stylesheet, so none of the dashboard chrome ends
 * up on the page.
 */
export default function HomeworkPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading: authLoading } = useTeacherGuard();
  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    (async () => {
      const [{ data: hw }, { data: qs }] = await Promise.all([
        supabase.from("homework_assignments").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("homework_questions")
          .select("*")
          .eq("assignment_id", id)
          .order("display_order", { ascending: true }),
      ]);
      if (!hw) {
        setNotFound(true);
      } else {
        setAssignment(hw as HomeworkAssignment);
        setQuestions((qs || []) as HomeworkQuestion[]);
      }
      setLoading(false);
    })();
  }, [id, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (notFound || !assignment) {
    return <div className="p-8 text-center text-gray-500">Homework not found.</div>;
  }

  const title = assignment.title_ar || assignment.title_en || "Homework";
  const instructions = assignment.instructions_ar || assignment.instructions_en;

  const optionLabels = ["أ", "ب", "ج", "د", "هـ", "و"];

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* Print-only stylesheet: render just #worksheet, hide all app chrome. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #worksheet, #worksheet * { visibility: visible !important; }
          #worksheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; box-shadow: none; }
          .no-print { display: none !important; }
          .q-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print max-w-[800px] mx-auto mb-4 flex items-center justify-between px-4">
        <p className="text-sm text-gray-500">Preview — this prints on plain paper without the app menus.</p>
        <button
          onClick={() => window.print()}
          className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          Print
        </button>
      </div>

      <div
        id="worksheet"
        dir="rtl"
        className="max-w-[800px] mx-auto bg-white text-black p-8 sm:p-10 shadow-sm print:shadow-none leading-relaxed"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold">مدرسة أمل</h1>
            {assignment.total_points != null && (
              <span className="text-sm">الدرجة: ____ / {assignment.total_points}</span>
            )}
          </div>
          <h2 className="text-lg font-semibold mt-1">{title}</h2>
        </div>

        {/* Name / date / class fields */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-5">
          <div>الاسم: ____________________________</div>
          <div>التاريخ: ________________________</div>
          <div>الصف: ____________________________</div>
          <div>المعلم: ________________________</div>
        </div>

        {instructions && (
          <p className="text-sm mb-5 border-r-4 border-gray-400 pr-3">{instructions}</p>
        )}

        {/* Questions */}
        <ol className="space-y-6">
          {questions.map((q, idx) => (
            <li key={q.id} className="q-block">
              <div className="flex gap-2">
                <span className="font-bold">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="font-semibold">{q.question_text_ar || q.question_text_en}</p>
                  {q.question_text_ar && q.question_text_en && (
                    <p dir="ltr" className="text-sm text-gray-600 mt-0.5">{q.question_text_en}</p>
                  )}
                  {typeof q.points === "number" && (
                    <span className="text-xs text-gray-500">({q.points} نقاط)</span>
                  )}

                  {/* Answer space by type */}
                  <div className="mt-2">
                    {q.question_type === "multiple_choice" && Array.isArray(q.options) && (
                      <div className="space-y-1.5">
                        {(q.options as string[]).map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="inline-block w-5 h-5 rounded-full border-2 border-black shrink-0" />
                            <span>
                              {optionLabels[i] ? `${optionLabels[i]}) ` : ""}
                              {opt}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.question_type === "true_false" && (
                      <div className="flex gap-8">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-5 h-5 rounded-full border-2 border-black" />
                          <span>صحيح</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-5 h-5 rounded-full border-2 border-black" />
                          <span>خطأ</span>
                        </div>
                      </div>
                    )}

                    {q.question_type === "short_answer" && (
                      <div className="border-b border-black h-7 mt-1" />
                    )}

                    {(q.question_type === "long_answer" || q.question_type === "file_upload") && (
                      <div className="space-y-5 mt-2">
                        {[0, 1, 2, 3].map((n) => (
                          <div key={n} className="border-b border-black" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {questions.length === 0 && (
          <p className="text-center text-gray-500 py-8">This homework has no questions.</p>
        )}
      </div>
    </div>
  );
}

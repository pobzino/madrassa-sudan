"use client";

import { use, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import type { HomeworkAssignment, HomeworkQuestion } from "@/lib/homework.types";

interface PrintableCohort {
  name: string;
  grade_level: number | null;
}

interface PrintableSubject {
  name_ar: string | null;
  name_en: string | null;
}

interface PrintableAssignment extends HomeworkAssignment {
  cohorts?: PrintableCohort | PrintableCohort[] | null;
  subjects?: PrintableSubject | PrintableSubject[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getOptions(question: HomeworkQuestion): string[] {
  if (!Array.isArray(question.options)) return [];
  return question.options.filter(
    (option): option is string => typeof option === "string" && option.trim().length > 0
  );
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getQuestionText(question: HomeworkQuestion) {
  return question.question_text_en || question.question_text_ar;
}

function getSecondaryQuestionText(question: HomeworkQuestion) {
  if (!question.question_text_en || !question.question_text_ar) return null;
  return question.question_text_en === question.question_text_ar
    ? null
    : question.question_text_ar;
}

function getPromptLead(question: HomeworkQuestion) {
  switch (question.question_type) {
    case "multiple_choice":
      return "Circle.";
    case "true_false":
      return "Tick.";
    case "short_answer":
    case "long_answer":
      return "Write.";
    case "file_upload":
      return "Draw / attach.";
    default:
      return "Answer.";
  }
}

function AnswerLines({ count }: { count: number }) {
  return (
    <div className="mt-5 space-y-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-8 border-b-2 border-black" />
      ))}
    </div>
  );
}

function DrawingBox({ children, tall = false }: { children?: ReactNode; tall?: boolean }) {
  return (
    <div
      className={`mt-4 rounded-xl border-2 border-dashed border-[#b8b8b8] p-4 ${
        tall ? "min-h-[340px]" : "min-h-[190px]"
      }`}
    >
      {children}
    </div>
  );
}

function OptionPill({ children }: { children: ReactNode }) {
  return (
    <div
      dir="auto"
      className="rounded-xl border-2 border-[#dedede] px-5 py-2.5 text-center text-[24px] font-extrabold leading-tight"
    >
      {children}
    </div>
  );
}

/**
 * Printable, pen-and-paper worksheet for a homework assignment.
 *
 * The styling intentionally follows the camp worksheet PDF format: compact
 * brand header, green section rule, numbered green activity dots, pill choices,
 * handwriting lines, dashed drawing boxes, and a quiet footer.
 */
export default function HomeworkPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading: authLoading } = useTeacherGuard();
  const [assignment, setAssignment] = useState<PrintableAssignment | null>(null);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    (async () => {
      const [{ data: hw }, { data: qs }] = await Promise.all([
        supabase
          .from("homework_assignments")
          .select("*, cohorts(name, grade_level), subjects(name_ar, name_en)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("homework_questions")
          .select("*")
          .eq("assignment_id", id)
          .order("display_order", { ascending: true }),
      ]);
      if (!hw) {
        setNotFound(true);
      } else {
        setAssignment(hw as PrintableAssignment);
        setQuestions((qs || []) as HomeworkQuestion[]);
      }
      setLoading(false);
    })();
  }, [id, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (notFound || !assignment) {
    return <div className="p-8 text-center text-gray-500">Homework not found.</div>;
  }

  const title = assignment.title_en || assignment.title_ar || "Homework";
  const cohort = firstRelation(assignment.cohorts);
  const subject = firstRelation(assignment.subjects);
  const subjectName = subject?.name_en || subject?.name_ar || null;
  const dueAt = formatDateTime(assignment.due_at);
  const worksheetFooter = [
    "amal school",
    subjectName || "Homework",
    cohort?.name || null,
    dueAt ? `Due ${dueAt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4;
          margin: 14mm;
        }
        @media print {
          html, body {
            background: #fff !important;
            background-image: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * { visibility: hidden !important; }
          #worksheet, #worksheet * { visibility: visible !important; }
          #worksheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            min-height: 0;
            padding: 0;
            margin: 0;
            border: 0;
            box-shadow: none;
          }
          .no-print { display: none !important; }
          .q-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 max-w-[210mm] px-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/teacher/homework"
              className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to homework
            </Link>
            <p className="text-sm text-gray-600">
              A4 worksheet preview matching the camp worksheet PDF style.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" />
            Save PDF / Print
          </button>
        </div>
      </div>

      <div
        id="worksheet"
        dir="ltr"
        className="relative mx-auto min-h-[297mm] max-w-[210mm] bg-white px-10 py-11 text-[#222] shadow-sm print:min-h-0 print:shadow-none"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        <header className="mb-7">
          <div className="flex items-start justify-between gap-6">
            <Image
              src="/signature.svg"
              width={210}
              height={60}
              alt="amal school"
              className="h-auto w-[165px]"
              priority
            />
            <div className="text-right">
              <div className="text-[17px] font-extrabold text-[#2e7d32]">
                {subjectName || "Homework"} · Worksheet
              </div>
              <div className="mt-1 text-[15px] font-extrabold text-[#c62828]">
                AT HOME
              </div>
              <div className="mt-4 flex items-center justify-end gap-3 text-[15px]">
                <span>Name:</span>
                <span className="inline-block w-[180px] border-b-2 border-[#222]" />
              </div>
            </div>
          </div>

          <h1
            dir="auto"
            className="mt-6 text-[31px] font-extrabold leading-tight text-[#2e7d32]"
          >
            {title}
          </h1>
          <div className="mt-4 h-[3px] w-full bg-[#2e7d32]" />
        </header>

        {(assignment.instructions_ar || assignment.instructions_en) && (
          <div className="mb-7 rounded-lg border border-[#d8d8d8] px-4 py-3 text-[14px] leading-relaxed text-[#444]">
            {assignment.instructions_en && <p dir="ltr">{assignment.instructions_en}</p>}
            {assignment.instructions_ar && (
              <p dir="rtl" className={assignment.instructions_en ? "mt-1" : ""}>
                {assignment.instructions_ar}
              </p>
            )}
          </div>
        )}

        <ol className="space-y-6 pb-10">
          {questions.map((q, idx) => {
            const options = getOptions(q);
            return (
              <li key={q.id} className="q-block">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2e7d32] text-[17px] font-extrabold leading-none text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-[22px] font-extrabold leading-snug">
                      <span>{getPromptLead(q)}</span> <span>{getQuestionText(q)}</span>
                    </p>
                    {getSecondaryQuestionText(q) && (
                      <p dir="rtl" className="mt-1 text-[14px] font-semibold text-[#666]">
                        {getSecondaryQuestionText(q)}
                      </p>
                    )}
                    {typeof q.points === "number" && (
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#9a9a9a]">
                        {q.points} points
                      </p>
                    )}

                    <div className="mt-3">
                      {q.question_type === "multiple_choice" && (
                        options.length > 0 ? (
                          <div className="grid grid-cols-2 gap-x-12 gap-y-4 px-8 py-1">
                            {options.map((opt, i) => (
                              <OptionPill key={i}>{opt}</OptionPill>
                            ))}
                          </div>
                        ) : (
                          <AnswerLines count={1} />
                        )
                      )}

                      {q.question_type === "true_false" && (
                        <div className="grid grid-cols-2 gap-x-12 px-8 py-1">
                          <OptionPill>True</OptionPill>
                          <OptionPill>False</OptionPill>
                        </div>
                      )}

                      {q.question_type === "short_answer" && <AnswerLines count={2} />}

                      {q.question_type === "long_answer" && (
                        <DrawingBox tall>
                          <AnswerLines count={5} />
                        </DrawingBox>
                      )}

                      {q.question_type === "file_upload" && (
                        <DrawingBox tall>
                          {q.instructions && (
                            <p dir="auto" className="mb-4 text-[16px] font-semibold text-[#444]">
                              {q.instructions}
                            </p>
                          )}
                          <p className="text-[16px] font-semibold text-[#444]">
                            Draw here, or attach the paper work to this worksheet.
                          </p>
                        </DrawingBox>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {questions.length === 0 && (
          <p className="py-12 text-center text-[18px] font-semibold text-[#777]">
            This homework has no questions.
          </p>
        )}

        <footer className="text-center text-[13px] text-[#b9b9b9]">
          {worksheetFooter}
        </footer>
      </div>
    </div>
  );
}

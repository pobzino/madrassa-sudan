"use client";

// Review and edit a Big Challenge (milestone): title, battle size, boss, and
// the AI-drafted question pool. Draft: add, edit, delete freely. Published:
// text and answer-key fixes only (same questions), as the server enforces.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import InteractionRenderer from "@/components/interactions/InteractionRenderer";
import { FitBoss } from "@/components/milestones/Characters";
import { PoolTagSummary, QuestionTagControls } from "@/components/milestones/QuestionTags";
import { PLACEMENT_QUESTION_COUNT, type RetagResponse } from "@/lib/measurement/types";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import {
  BOSS_KEYS,
  MILESTONE_MAX_BATTLE_QUESTIONS,
  MILESTONE_MIN_BATTLE_QUESTIONS,
  type BossKey,
  type TeacherMilestoneDetail,
  type TeacherMilestoneQuestion,
  type TeacherMilestoneUpdate,
} from "@/lib/milestones/types";
import { BOSS_NAMES, heartsFor, requiredCorrect } from "@/lib/milestones/rules";

const ERRORS: Record<string, string> = {
  unpublish_first: "Unpublish first: a live challenge can only have text fixes.",
  pool_too_small: "Not enough auto-marked questions for the battle size yet.",
  publish_forbidden: "Only an approved admin or the path's teacher can publish this.",
  generation_failed: "Generation failed. Try again.",
  pool_unbalanced: "A starting boss needs at least 3 easy, 3 medium and 3 hard questions.",
};

function blankQuestion(order: number): TeacherMilestoneQuestion {
  return {
    question_type: "multiple_choice",
    interaction: null,
    question_text_ar: "",
    question_text_en: "",
    instruction_ar: null,
    instruction_en: null,
    question_content: null,
    question_content_language: null,
    answer_language: null,
    options_ar: ["", "", ""],
    options_en: ["", "", ""],
    correct_option_index: 0,
    correct_answer: "",
    source_lesson_id: null,
    display_order: order,
  };
}

/** Keep `correct_answer` in step with the chosen option, as the server validates. */
function syncAnswer(q: TeacherMilestoneQuestion): TeacherMilestoneQuestion {
  if ((q.question_type === "multiple_choice" || q.question_type === "true_false") && q.correct_option_index !== null) {
    return { ...q, correct_answer: q.options_ar[q.correct_option_index] ?? "" };
  }
  return q;
}

export default function TeacherMilestoneReviewPage() {
  const { loading: authLoading } = useTeacherGuard();
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<TeacherMilestoneDetail | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [size, setSize] = useState(12);
  const [bossKey, setBossKey] = useState<BossKey>("number_giant");
  const [questions, setQuestions] = useState<TeacherMilestoneQuestion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | "retag" | null>(null);

  const apply = useCallback((data: TeacherMilestoneDetail) => {
    setDetail(data);
    setTitleAr(data.milestone.titleAr);
    setTitleEn(data.milestone.titleEn ?? "");
    setSize(data.milestone.battleQuestionCount);
    setBossKey(data.milestone.bossKey);
    setQuestions(data.questions);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/teacher/milestones/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      toast.error("Could not load this Big Challenge");
      return;
    }
    apply(data as TeacherMilestoneDetail);
  }, [apply, id]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, load]);

  const published = detail?.milestone.status === "published";
  const lessonTitle = useMemo(() => new Map((detail?.lessons ?? []).map((l) => [l.id, `Week ${l.weekNumber} · ${l.title}`])), [detail]);
  const groups = useMemo(() => {
    const byLesson = new Map<string, Array<{ q: TeacherMilestoneQuestion; index: number }>>();
    questions.forEach((q, index) => {
      const key = q.source_lesson_id ?? "";
      byLesson.set(key, [...(byLesson.get(key) ?? []), { q, index }]);
    });
    return [...byLesson.entries()];
  }, [questions]);

  const update = (index: number, next: TeacherMilestoneQuestion) => {
    setQuestions((list) => list.map((q, i) => (i === index ? syncAnswer(next) : q)));
    setDirty(true);
  };

  const save = async () => {
    setBusy("save");
    try {
      const body: TeacherMilestoneUpdate = {
        titleAr,
        titleEn: titleEn || null,
        battleQuestionCount: size,
        bossKey,
        questions: questions.map((q, i) => ({ ...q, display_order: i })),
      };
      const res = await fetch(`/api/teacher/milestones/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(ERRORS[data.error] ?? `Save failed: ${data.message ?? data.error ?? "unknown error"}`);
      else {
        apply(data as TeacherMilestoneDetail);
        toast.success("Saved");
      }
    } finally {
      setBusy(null);
    }
  };

  const retag = async () => {
    if (dirty && !window.confirm("Tagging reloads the questions: unsaved edits will be lost. Continue?")) return;
    setBusy("retag");
    try {
      const res = await fetch(`/api/teacher/milestones/${id}/retag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "untagged" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(ERRORS[data.error] ?? `Tagging failed: ${data.message ?? data.error ?? "unknown error"}`);
      else {
        const r = data as RetagResponse;
        toast.success(`Tagged ${r.tagged} question${r.tagged === 1 ? "" : "s"}${r.disputed ? ` · ${r.disputed} to check` : ""}${r.unchanged ? ` · ${r.unchanged} unchanged` : ""}`);
        await load();
      }
    } catch {
      toast.error("Tagging failed");
    } finally {
      setBusy(null);
    }
  };

  const setLive = async (live: boolean) => {
    if (!live && !window.confirm(`Unpublish this ${detail?.milestone.kind === "placement" ? "starting boss" : "Big Challenge"}? Any games children are playing now will be reset.`)) return;
    setBusy(live ? "publish" : "unpublish");
    try {
      const res = await fetch(`/api/teacher/milestones/${id}/${live ? "publish" : "unpublish"}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(ERRORS[data.error] ?? `Failed: ${data.message ?? data.error ?? "unknown error"}`);
      else {
        toast.success(live ? "Published: children can play it now" : "Unpublished");
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const m = detail.milestone;
  const placement = m.kind === "placement";
  const skills = detail.skills ?? [];
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/teacher/learning-path" className="text-sm font-medium text-emerald-700 hover:underline">
          ← Learning path
        </Link>
        <div className="flex-1" />
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {published ? (placement ? "Published" : `Published · ${m.certificates} certificates`) : `Draft · ${questions.length} questions`}
        </span>
        <Link href={`/milestones/${m.id}`} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50" title="Play it as staff: preview mode, no certificate">
          Try it
        </Link>
        <button onClick={save} disabled={!dirty || busy !== null} className="rounded-xl bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        {published ? (
          <button onClick={() => void setLive(false)} disabled={busy !== null} className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            Unpublish
          </button>
        ) : (
          <button onClick={() => void setLive(true)} disabled={dirty || busy !== null} className="rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50" title={dirty ? "Save first" : undefined}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {placement ? "Starting boss · “Meet your first boss”" : `Big Challenge after week ${m.afterWeekNumber} (weeks ${m.afterWeekNumber - 3}–${m.afterWeekNumber})`}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {m.autoGradableCount} auto-marked questions in the pool · {m.activeBattles} {placement ? "games" : "battles"} in progress
        </p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Title (Arabic)
            <input dir="rtl" value={titleAr} onChange={(e) => { setTitleAr(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Title (English)
            <input value={titleEn} onChange={(e) => { setTitleEn(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
          {placement ? (
            <p className="text-sm font-medium text-gray-700">
              Game size: {PLACEMENT_QUESTION_COUNT} questions (fixed): 4 easy, 4 medium, 4 hard. No tries, no hint, never locks.
            </p>
          ) : (
            <label className="block text-sm font-medium text-gray-700">
              Battle size: {size} questions ({requiredCorrect(size)} right to win, {heartsFor(size)} shields)
              <input
                type="range"
                min={MILESTONE_MIN_BATTLE_QUESTIONS}
                max={MILESTONE_MAX_BATTLE_QUESTIONS}
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setDirty(true); }}
                className="mt-2 w-full accent-emerald-600"
              />
            </label>
          )}
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">Boss</p>
          <div className="grid grid-cols-3 gap-2">
            {BOSS_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { setBossKey(key); setDirty(true); }}
                aria-pressed={bossKey === key}
                title={BOSS_NAMES[key].en}
                className={`rounded-xl border-2 p-1 ${bossKey === key ? "border-emerald-500 bg-emerald-50" : "border-gray-100"}`}
              >
                <FitBoss bossKey={key} pose={bossKey === key ? "taunt" : "idle"} className="h-16 w-16" />
              </button>
            ))}
          </div>
          <p className="mt-1 text-center text-xs text-gray-500">{BOSS_NAMES[bossKey].en}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Skills and difficulty in the pool</h2>
          <div className="flex-1" />
          <button
            onClick={() => void retag()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            title="Ask the AI to tag questions that have no skill or difficulty yet"
          >
            {busy === "retag" && <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-emerald-600" />}
            {busy === "retag" ? "Tagging…" : "Tag questions with AI"}
          </button>
        </div>
        <PoolTagSummary questions={questions} skills={skills} />
        <p className="mt-2 text-[11px] text-gray-500">Tag edits are corrections: they also update results already recorded. You can edit tags while published.</p>
      </section>

      {groups.map(([lessonId, items]) => (
        <section key={lessonId || "none"} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{lessonTitle.get(lessonId) ?? "Other questions"}</h2>
          <ol className="space-y-3">
            {items.map(({ q, index }) => (
              <li key={q.id ?? `new-${index}`} className="rounded-xl bg-gray-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500">{q.question_type === "interaction" ? q.interaction?.type ?? "interaction" : q.question_type}</span>
                  <div className="flex-1" />
                  {!published && (
                    <button onClick={() => { setQuestions((list) => list.filter((_, i) => i !== index)); setDirty(true); }} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  )}
                </div>
                {q.question_type === "interaction" && q.interaction ? (
                  <InteractionRenderer
                    interaction={q.interaction}
                    mode="author"
                    language="ar"
                    onInteractionChange={(next) => update(index, { ...q, interaction: next, question_text_ar: next.prompt.ar, question_text_en: next.prompt.en })}
                  />
                ) : (
                  <LegacyQuestionEditor question={q} published={published} onChange={(next) => update(index, next)} />
                )}
                <QuestionTagControls question={q} skills={skills} onChange={(next) => update(index, next)} />
              </li>
            ))}
          </ol>
        </section>
      ))}

      {!published && (
        <button
          onClick={() => { setQuestions((list) => [...list, blankQuestion(list.length)]); setDirty(true); }}
          className="w-full rounded-2xl border-2 border-dashed border-emerald-200 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          + Add a question
        </button>
      )}
    </div>
  );
}

function LegacyQuestionEditor({ question: q, published, onChange }: { question: TeacherMilestoneQuestion; published: boolean; onChange: (next: TeacherMilestoneQuestion) => void }) {
  const choice = q.question_type !== "short_answer";
  const setOption = (lang: "ar" | "en", i: number, value: string) => {
    const key = lang === "ar" ? "options_ar" : "options_en";
    onChange({ ...q, [key]: q[key].map((o, j) => (j === i ? value : o)) });
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input dir="rtl" value={q.question_text_ar} onChange={(e) => onChange({ ...q, question_text_ar: e.target.value })} placeholder="Question (Arabic)" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
        <input value={q.question_text_en ?? ""} onChange={(e) => onChange({ ...q, question_text_en: e.target.value })} placeholder="Question (English)" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
      </div>
      {!published && (
        <select
          value={q.question_type}
          onChange={(e) => {
            const type = e.target.value as TeacherMilestoneQuestion["question_type"];
            onChange(
              type === "true_false"
                ? { ...q, question_type: type, options_ar: ["صحيح", "خطأ"], options_en: ["True", "False"], correct_option_index: 0 }
                : type === "short_answer"
                  ? { ...q, question_type: type, options_ar: [], options_en: [], correct_option_index: null }
                  : { ...q, question_type: type, options_ar: q.options_ar.length ? q.options_ar : ["", "", ""], options_en: q.options_en.length ? q.options_en : ["", "", ""], correct_option_index: 0 }
            );
          }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
        >
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True / false</option>
          <option value="short_answer">Short answer</option>
        </select>
      )}
      {choice ? (
        <ul className="space-y-1.5">
          {q.options_ar.map((option, i) => {
            const correct = q.correct_option_index === i;
            return (
              <li key={i} className={`grid items-center gap-2 rounded-lg p-1.5 sm:grid-cols-[auto_1fr_1fr] ${correct ? "bg-emerald-50 ring-1 ring-emerald-300" : ""}`}>
                <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
                  <input type="radio" checked={correct} onChange={() => onChange({ ...q, correct_option_index: i })} />
                  {correct ? "Correct" : `Option ${i + 1}`}
                </label>
                <input dir="rtl" value={option} disabled={q.question_type === "true_false"} onChange={(e) => setOption("ar", i, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-sm" />
                <input value={q.options_en[i] ?? ""} disabled={q.question_type === "true_false"} onChange={(e) => setOption("en", i, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-sm" />
              </li>
            );
          })}
          {!published && q.question_type === "multiple_choice" && q.options_ar.length < 4 && (
            <button onClick={() => onChange({ ...q, options_ar: [...q.options_ar, ""], options_en: [...q.options_en, ""] })} className="text-xs font-medium text-emerald-700 hover:underline">
              + Option
            </button>
          )}
        </ul>
      ) : (
        <input value={q.correct_answer} onChange={(e) => onChange({ ...q, correct_answer: e.target.value })} placeholder="Correct answer" className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-sm" />
      )}
    </div>
  );
}

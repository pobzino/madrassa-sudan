"use client";

import type { Difficulty, SkillInfo } from "@/lib/measurement/types";
import type { TeacherMilestoneQuestion } from "@/lib/milestones/types";

/**
 * Staff tagging for battle items: which skill an item checks and how hard it
 * is (1 recall, 2 apply, 3 stretch). Edits are corrections and also apply to
 * results already recorded.
 */
export const DIFFICULTY_LABELS: Record<Difficulty, { short: string; help: string }> = {
  1: { short: "Easy", help: "Recall: one step, a taught example or fact" },
  2: { short: "Medium", help: "Apply: one step on a fresh example, or a familiar two-step" },
  3: { short: "Hard", help: "Stretch: two or more steps, or a new context, still inside what was taught" },
};

export function QuestionTagControls({
  question,
  skills,
  onChange,
}: {
  question: TeacherMilestoneQuestion;
  skills: SkillInfo[];
  onChange: (next: TeacherMilestoneQuestion) => void;
}) {
  const assessable = skills.filter((s) => s.assessable).sort((a, b) => a.sortOrder - b.sortOrder);
  const bySubject = new Map<string, SkillInfo[]>();
  for (const skill of assessable) bySubject.set(skill.subjectKey, [...(bySubject.get(skill.subjectKey) ?? []), skill]);
  const value = question.skill_key ?? "";
  const known = !value || assessable.some((s) => s.skillKey === value);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2">
      <label className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-gray-600">
        Skill
        <select
          value={value}
          onChange={(e) => onChange({ ...question, skill_key: e.target.value || null })}
          className="max-w-[240px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800"
        >
          <option value="">Not tagged</option>
          {!known && <option value={value}>{value}</option>}
          {[...bySubject.entries()].map(([subjectKey, list]) => (
            <optgroup key={subjectKey} label={subjectKey}>
              {list.map((s) => (
                <option key={s.skillKey} value={s.skillKey}>
                  {s.labelEn}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Difficulty" className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
        {([1, 2, 3, null] as const).map((d) => {
          const active = (question.difficulty ?? null) === d;
          return (
            <button
              key={d ?? "none"}
              type="button"
              role="radio"
              aria-checked={active}
              title={d ? DIFFICULTY_LABELS[d].help : "No difficulty"}
              onClick={() => onChange({ ...question, difficulty: d })}
              className={`px-2.5 py-1 font-medium ${active ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"} ${d !== 1 ? "border-s border-gray-200" : ""}`}
            >
              {d ? DIFFICULTY_LABELS[d].short : "—"}
            </button>
          );
        })}
      </div>
      {question.tag_source === "model_disputed" && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="The AI checker disagreed about this item's skill or difficulty. Please check it.">
          disputed
        </span>
      )}
      {question.tag_source === "backfill_lesson" && (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800" title="Skill taken from the lesson's curriculum topic">
          from lesson
        </span>
      )}
      {question.tag_source === "teacher" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">set by staff</span>}
    </div>
  );
}

/** Per skill: how many items of each difficulty the pool has. */
export function poolTagSummary(questions: readonly TeacherMilestoneQuestion[]) {
  const rows = new Map<string, { d1: number; d2: number; d3: number; none: number }>();
  const totals = { d1: 0, d2: 0, d3: 0, none: 0 };
  for (const q of questions) {
    const key = q.skill_key ?? "";
    const row = rows.get(key) ?? { d1: 0, d2: 0, d3: 0, none: 0 };
    const slot = q.difficulty === 1 ? "d1" : q.difficulty === 2 ? "d2" : q.difficulty === 3 ? "d3" : "none";
    row[slot] += 1;
    totals[slot] += 1;
    rows.set(key, row);
  }
  return { rows: [...rows.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))), totals };
}

export function PoolTagSummary({ questions, skills }: { questions: readonly TeacherMilestoneQuestion[]; skills: SkillInfo[] }) {
  const { rows, totals } = poolTagSummary(questions);
  const label = new Map(skills.map((s) => [s.skillKey, s.labelEn]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="py-1 pe-2 font-medium">Skill</th>
            <th className="px-2 py-1 text-end font-medium">Easy</th>
            <th className="px-2 py-1 text-end font-medium">Medium</th>
            <th className="px-2 py-1 text-end font-medium">Hard</th>
            <th className="px-2 py-1 text-end font-medium">—</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, row]) => (
            <tr key={key || "none"} className="border-t border-gray-100 text-gray-800">
              <td className="py-1 pe-2">{key ? label.get(key) ?? key : <span className="text-gray-400">Not tagged</span>}</td>
              <td className="px-2 py-1 text-end tabular-nums">{row.d1}</td>
              <td className="px-2 py-1 text-end tabular-nums">{row.d2}</td>
              <td className="px-2 py-1 text-end tabular-nums">{row.d3}</td>
              <td className="px-2 py-1 text-end tabular-nums text-gray-400">{row.none}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
            <td className="py-1 pe-2">All</td>
            <td className="px-2 py-1 text-end tabular-nums">{totals.d1}</td>
            <td className="px-2 py-1 text-end tabular-nums">{totals.d2}</td>
            <td className="px-2 py-1 text-end tabular-nums">{totals.d3}</td>
            <td className="px-2 py-1 text-end tabular-nums text-gray-500">{totals.none}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

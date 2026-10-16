"use client";

import Link from "next/link";
import { FitBoss } from "./Characters";
import { PLACEMENT_MIN_PER_DIFFICULTY, PLACEMENT_QUESTION_COUNT } from "@/lib/measurement/types";
import type { TeacherMilestoneRow } from "@/lib/milestones/types";

/** "Easy 5 · Medium 6 · Hard 4" (+ "· 2 untagged"). */
export function difficultyCountLabel(counts: TeacherMilestoneRow["difficultyCounts"]): string {
  if (!counts) return "Difficulty not tagged yet";
  const parts = [`Easy ${counts.d1}`, `Medium ${counts.d2}`, `Hard ${counts.d3}`];
  if (counts.none > 0) parts.push(`${counts.none} untagged`);
  return parts.join(" · ");
}

/** True when a starting boss can't be published yet (fewer than 3 of some difficulty). */
export function difficultyShort(counts: TeacherMilestoneRow["difficultyCounts"]): boolean {
  if (!counts) return true;
  return [counts.d1, counts.d2, counts.d3].some((n) => n < PLACEMENT_MIN_PER_DIFFICULTY);
}

/**
 * The path's "Starting boss" (placement) on the teacher's learning-path page,
 * above week 1: Generate / Regenerate, Review & edit, Publish / Unpublish and
 * the difficulty mix (it needs at least 3 easy, 3 medium and 3 hard).
 */
export default function PlacementBlockCard({
  placement,
  hasPath,
  disabled,
  generating,
  busy,
  onGenerate,
  onPublish,
  onUnpublish,
  onToggleRequired,
}: {
  placement: TeacherMilestoneRow | null;
  hasPath: boolean;
  /** The path order has unsaved changes. */
  disabled: boolean;
  generating: boolean;
  busy: boolean;
  onGenerate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  /** Flip "children must meet this boss before lesson 1". */
  onToggleRequired?: (required: boolean) => void;
}) {
  const m = placement;
  const published = m?.status === "published";
  const short = m ? difficultyShort(m.difficultyCounts) : false;
  const status = !m ? "Not created" : published ? "Published" : `Draft · ${m.poolSize} questions`;
  return (
    <div className="mb-3 rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <FitBoss bossKey={m?.bossKey ?? "number_giant"} pose="happy" className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">Starting boss · &ldquo;Meet your first boss&rdquo;</p>
          <p className="text-xs text-gray-600">
            {PLACEMENT_QUESTION_COUNT} questions from the whole path, easy to hard. Shows each child&apos;s starting point.
          </p>
          {m && (
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#007229]"
                checked={m.required !== false}
                disabled={busy || !onToggleRequired}
                onChange={(event) => onToggleRequired?.(event.target.checked)}
              />
              <span>
                Children must meet this boss before lesson 1
                <span className="text-gray-500"> (only children who haven&apos;t started the path; never offline)</span>
              </span>
            </label>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                !m ? "bg-gray-100 text-gray-600" : published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {status}
            </span>
            {m && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${short ? "bg-red-50 text-red-700" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>
                {difficultyCountLabel(m.difficultyCounts)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {generating ? (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-sky-700">
              <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-sky-600" />
              Generating… (up to 2 minutes)
            </span>
          ) : (
            !published && (
              <button
                onClick={onGenerate}
                disabled={disabled || busy || !hasPath}
                className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-40"
                title={disabled ? "Save the path first" : "Draft 30 questions across the path's first 12 weeks"}
              >
                {m ? "↻ Regenerate" : "⚡ Generate"}
              </button>
            )
          )}
          {m && (
            <Link href={`/teacher/milestones/${m.id}`} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
              Review &amp; edit
            </Link>
          )}
          {m &&
            (published ? (
              <button onClick={onUnpublish} disabled={disabled || busy} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">
                Unpublish
              </button>
            ) : (
              <button
                onClick={onPublish}
                disabled={disabled || busy || short}
                title={short ? "Needs at least 3 easy, 3 medium and 3 hard questions" : undefined}
                className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
              >
                Publish
              </button>
            ))}
        </div>
      </div>
      {m && short && (
        <p className="mt-2 text-xs font-medium text-red-700">
          ⚠ A starting boss needs at least {PLACEMENT_MIN_PER_DIFFICULTY} easy, {PLACEMENT_MIN_PER_DIFFICULTY} medium and {PLACEMENT_MIN_PER_DIFFICULTY} hard questions. Tag or add questions in Review &amp; edit.
        </p>
      )}
    </div>
  );
}

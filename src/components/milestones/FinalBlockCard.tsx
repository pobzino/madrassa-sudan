"use client";

import Link from "next/link";
import { BoltIcon, RefreshIcon, WarningIcon } from "@/components/icons/AmalIcons";
import { FitBoss } from "./Characters";
import type { TeacherMilestoneRow } from "@/lib/milestones/types";

/**
 * The path's final boss ("The Grand Challenge") on the teacher's learning-path
 * page: after the last week, drawn from the whole path with the starting
 * boss's 4 easy / 4 medium / 4 hard plan, so start and finish compare like
 * for like. Status, Generate draft / Regenerate, Review & edit, Publish / Unpublish.
 */
export default function FinalBlockCard({
  final,
  lastWeekNumber,
  disabled,
  generating,
  busy,
  onGenerate,
  onPublish,
  onUnpublish,
}: {
  final: TeacherMilestoneRow | null;
  /** The path's last week (null while the path has no weeks). */
  lastWeekNumber: number | null;
  /** The path order has unsaved changes. */
  disabled: boolean;
  generating: boolean;
  busy: boolean;
  onGenerate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const m = final;
  const published = m?.status === "published";
  const status = !m
    ? "Not created"
    : published
      ? `Published · ${m.certificates} certificates`
      : `Draft · ${m.poolSize} questions`;
  // The path grew since the draft was made: its questions miss the new weeks.
  const stale = m && lastWeekNumber !== null && m.afterWeekNumber !== lastWeekNumber;
  return (
    <div className="my-3 rounded-2xl border-2 border-violet-200 bg-violet-50/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <FitBoss bossKey={m?.bossKey ?? "number_giant"} pose={published ? "ko" : "powered"} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            The Grand Challenge · final boss{lastWeekNumber ? ` after week ${lastWeekNumber} (weeks 1–${lastWeekNumber})` : ""}
          </p>
          <p className="text-xs text-gray-600">12 questions from the whole path, 4 easy / 4 medium / 4 hard, like the starting boss: that is the before/after.</p>
          <span
            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              !m ? "bg-gray-100 text-gray-600" : published ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {generating ? (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-violet-700">
              <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-violet-600" />
              Generating… (a few minutes)
            </span>
          ) : (
            !published && (
              <button
                onClick={onGenerate}
                disabled={disabled || busy || !lastWeekNumber}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-40"
                title={disabled ? "Save the path first" : "Draft a question pool from the whole path"}
              >
                {m ? (
                  <>
                    <RefreshIcon className="h-3 w-3" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <BoltIcon className="h-3 w-3" />
                    Generate draft
                  </>
                )}
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
              <button onClick={onPublish} disabled={disabled || busy} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
                Publish
              </button>
            ))}
        </div>
      </div>
      {stale && (
        <p className="mt-2 flex items-start gap-1 text-xs font-medium text-violet-800">
          <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Drafted when the path ended at week {m.afterWeekNumber}; it now ends at week {lastWeekNumber}. Unpublish and regenerate to cover the new weeks.
        </p>
      )}
    </div>
  );
}

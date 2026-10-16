"use client";

import Link from "next/link";
import Boss from "./Boss";
import type { TeacherMilestoneBlock } from "@/lib/milestones/types";

/**
 * The Big Challenge for one 4-week block on the teacher's learning-path page:
 * status, Generate draft / Regenerate, Review & edit, Publish / Unpublish.
 */
export default function MilestoneBlockCard({
  afterWeekNumber,
  block,
  disabled,
  generating,
  busy,
  onGenerate,
  onPublish,
  onUnpublish,
}: {
  afterWeekNumber: number;
  block: TeacherMilestoneBlock | null;
  /** The path order has unsaved changes. */
  disabled: boolean;
  generating: boolean;
  busy: boolean;
  onGenerate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const m = block?.milestone ?? null;
  const published = m?.status === "published";
  const status = !m
    ? "Not created"
    : published
      ? `Published · ${m.certificates} certificates`
      : `Draft · ${m.poolSize} questions`;
  const thin = block && block.lessonsWithContent < block.lessonCount;
  return (
    <div className="my-3 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Boss bossKey={m?.bossKey ?? "number_giant"} level={afterWeekNumber / 4} mood={published ? "ko" : "curious"} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            Big Challenge after week {afterWeekNumber} (weeks {afterWeekNumber - 3}–{afterWeekNumber})
          </p>
          <span
            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              !m ? "bg-gray-100 text-gray-600" : published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {generating ? (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-700">
              <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-amber-600" />
              Generating… (up to 2 minutes)
            </span>
          ) : (
            !published && (
              <button
                onClick={onGenerate}
                disabled={disabled || busy || !block}
                className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                title={disabled ? "Save the path first" : "Draft a question pool from these 4 weeks' lessons"}
              >
                {m ? "↻ Regenerate" : "⚡ Generate draft"}
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
              <button onClick={onPublish} disabled={disabled || busy} className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
                Publish
              </button>
            ))}
        </div>
      </div>
      {thin && (
        <p className="mt-2 text-xs font-medium text-amber-800">
          ⚠ {block.lessonCount - block.lessonsWithContent} of {block.lessonCount} lessons have no recorded slides yet, so the AI has less to draw questions from.
        </p>
      )}
    </div>
  );
}

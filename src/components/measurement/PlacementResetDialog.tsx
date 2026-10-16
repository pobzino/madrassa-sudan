"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { PlacementResetRequest, PlacementResetResponse } from "@/lib/measurement/types";
import type { TeacherMilestoneListResponse } from "@/lib/milestones/types";

interface SubjectOption {
  id: string;
  name: string;
  placementId: string | null;
}

/**
 * Admin Members tab: let a child meet a subject's starting boss again (a
 * re-placement). Choose the subject's placement, give a reason, confirm. The
 * old result is kept for audit but no longer counts.
 */
export default function PlacementResetDialog({ learnerId, learnerName, onClose }: { learnerId: string; learnerName: string; onClose: () => void }) {
  const [subjects, setSubjects] = useState<SubjectOption[] | null>(null);
  const [milestoneId, setMilestoneId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("subjects").select("id, name_en, name_ar").order("name_en");
      const rows = (data ?? []) as Array<{ id: string; name_en: string | null; name_ar: string | null }>;
      const withPlacement = await Promise.all(
        rows.map(async (s) => {
          try {
            const res = await fetch(`/api/teacher/milestones?subject_id=${encodeURIComponent(s.id)}`, { cache: "no-store" });
            const body = res.ok ? ((await res.json()) as TeacherMilestoneListResponse) : null;
            return { id: s.id, name: s.name_en || s.name_ar || s.id, placementId: body?.placement?.status === "published" ? body.placement.id : null };
          } catch {
            return { id: s.id, name: s.name_en || s.name_ar || s.id, placementId: null };
          }
        })
      );
      if (cancelled) return;
      const usable = withPlacement.filter((s) => s.placementId);
      setSubjects(usable);
      if (usable.length === 1) setMilestoneId(usable[0].placementId!);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const valid = milestoneId && reason.trim().length >= 3 && reason.trim().length <= 200;
  const submit = async () => {
    if (!valid) return;
    const subject = subjects?.find((s) => s.placementId === milestoneId)?.name ?? "";
    if (!window.confirm(`Let ${learnerName || "this child"} meet the ${subject} starting boss again? Their current starting point stops counting.`)) return;
    setBusy(true);
    try {
      const body: PlacementResetRequest = { learnerId, milestoneId, reason: reason.trim() };
      const res = await fetch("/api/teacher/measurement/placement/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<PlacementResetResponse> & { error?: string; message?: string };
      if (!res.ok) {
        toast.error(
          data.error === "reset_forbidden"
            ? "Only an admin or the path's author can reset a starting boss."
            : data.error === "not_found"
              ? "That starting boss wasn't found."
              : `Reset failed: ${data.message ?? data.error ?? "unknown error"}`
        );
        return;
      }
      toast.success("Done: they can meet the starting boss again");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 id="reset-title" className="text-base font-semibold text-gray-900">Reset starting boss</h2>
            <p className="text-xs text-gray-500">{learnerName || "Unnamed learner"} can play the subject&apos;s &ldquo;Meet your first boss&rdquo; again.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        {subjects === null ? (
          <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ) : subjects.length === 0 ? (
          <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">No subject has a published starting boss yet.</p>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Subject
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">Choose…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.placementId!}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Reason
              <input
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. a sibling played on this profile"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!valid || busy} className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Resetting…" : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

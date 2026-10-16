"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

interface Status {
  backlog: { pairs: number; missing: { battle: number; practice: number; ar: number; en: number; total: number }; charsMissing: number };
  plan: { used: number; limit: number; resetsAt: string | null } | null;
  configured: boolean;
}

const n = (value: number) => new Intl.NumberFormat("en-GB").format(value);

/**
 * Voices every published question ahead of time (ElevenLabs clips, cached
 * for good): the admin starts it, a background worker drains the backlog,
 * and this card follows the count down.
 */
export default function NarrationCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/narration", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Status;
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  const follow = useCallback(
    (startedAt: number) => {
      timer.current = window.setTimeout(async () => {
        const data = await load();
        const stillMissing = data?.backlog.missing.total ?? 0;
        if (stillMissing > 0 && Date.now() - startedAt < 15 * 60 * 1000) follow(startedAt);
        else {
          setRunning(false);
          toast.success(stillMissing === 0 ? "Every question has a voice." : `Stopped with ${n(stillMissing)} still to voice.`);
        }
      }, 8000);
    },
    [load],
  );

  const start = async () => {
    setRunning(true);
    const res = await fetch("/api/admin/narration", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunning(false);
      toast.error(data.message ?? "Could not start");
      return;
    }
    toast.success("Voicing started: you can leave this page.");
    follow(Date.now());
  };

  const missing = status?.backlog.missing;
  const plan = status?.plan;
  const left = plan ? plan.limit - plan.used : null;
  return (
    <section className="border-b border-gray-200 pb-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Question voices</h3>
          <p className="text-xs text-gray-500">Every published Practice and boss question, Arabic and English, voiced once and kept.</p>
        </div>
        <Volume2 className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </div>
      {!status ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="text-2xl font-bold text-gray-900">{n(missing?.total ?? 0)}</p>
            <p className="text-xs text-gray-500">
              still to voice of {n(status.backlog.pairs)} · bosses {n(missing?.battle ?? 0)} · Practice {n(missing?.practice ?? 0)} · ≈ {n(status.backlog.charsMissing)} characters
            </p>
          </div>
          {plan && left !== null && (
            <div>
              <p className="text-2xl font-bold text-gray-900">{n(left)}</p>
              <p className="text-xs text-gray-500">
                characters left this month{plan.resetsAt ? ` (resets ${new Date(plan.resetsAt).toLocaleDateString("en-GB")})` : ""}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void start()}
            disabled={running || !status.configured || (missing?.total ?? 0) === 0}
            className="rounded-xl bg-[#007229] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005a20] disabled:opacity-40"
          >
            {running ? "Voicing…" : (missing?.total ?? 0) === 0 ? "All voiced" : "Voice everything now"}
          </button>
          {!status.configured && <p className="text-xs text-red-700">Narration is not configured on this site.</p>}
        </div>
      )}
    </section>
  );
}

"use client";

/**
 * Admin error log.
 *
 * Grouped by fingerprint rather than listed raw, because the question is never
 * "what was the 400th occurrence" — it is "what is broken, how many children
 * has it hit, and did it start with the last deploy".
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ErrorGroup {
  fingerprint: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  affected_users: number;
  latest_message: string;
  latest_route: string | null;
  source: string;
  latest_release: string | null;
  resolved: boolean;
}

interface ErrorRow {
  id: string;
  occurred_at: string;
  message: string;
  stack: string | null;
  route: string | null;
  source: string;
  level: string;
  status_code: number | null;
  user_role: string | null;
  release: string | null;
  context: Record<string, unknown> | null;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AdminErrorsPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState<ErrorGroup[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [samples, setSamples] = useState<ErrorRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("error_log_groups")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(100);

    if (err) {
      // RLS returns nothing for non-admins; surface that plainly.
      setError(err.message);
      setGroups([]);
      return;
    }
    setGroups((data ?? []) as unknown as ErrorGroup[]);
  }, [supabase]);

  useEffect(() => {
    // Inline rather than calling load() directly: the effect must not set state
    // synchronously, and this also lets a stale response be dropped on unmount.
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("error_log_groups")
        .select("*")
        .order("last_seen", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setGroups([]);
        return;
      }
      setGroups((data ?? []) as unknown as ErrorGroup[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const openGroup = async (fingerprint: string) => {
    if (expanded === fingerprint) {
      setExpanded(null);
      return;
    }
    setExpanded(fingerprint);
    const { data } = await supabase
      .from("error_logs")
      .select("*")
      .eq("fingerprint", fingerprint)
      .order("occurred_at", { ascending: false })
      .limit(5);
    setSamples((data ?? []) as unknown as ErrorRow[]);
  };

  const resolve = async (fingerprint: string) => {
    const { error: err } = await supabase
      .from("error_logs")
      .update({ resolved_at: new Date().toISOString() })
      .eq("fingerprint", fingerprint)
      .is("resolved_at", null);
    if (err) {
      toast.error("Could not mark as resolved");
      return;
    }
    toast.success("Marked resolved");
    void load();
  };

  const visible = (groups ?? []).filter((g) => (showResolved ? true : !g.resolved));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Errors</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Grouped by cause, newest first. Records are kept 30 days.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary,#007229)]"
          />
          Show resolved
        </label>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {groups === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <div className="mb-1 text-2xl">✅</div>
          <p className="text-sm font-medium text-gray-700">Nothing broken right now</p>
          <p className="mt-1 text-xs text-gray-400">
            Errors from the server and from tutors&apos; and students&apos; browsers appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => (
            <li key={g.fingerprint} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <button
                type="button"
                onClick={() => void openGroup(g.fingerprint)}
                className="flex w-full items-start gap-3 p-3 text-start transition-colors hover:bg-gray-50"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    g.source === "client"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {g.source}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {g.latest_message}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {g.latest_route ?? "—"} · {g.occurrences}×
                    {g.affected_users > 0 && ` · ${g.affected_users} user${g.affected_users === 1 ? "" : "s"}`}
                    {" · "}
                    {timeAgo(g.last_seen)}
                    {g.latest_release && ` · ${g.latest_release.slice(0, 7)}`}
                  </span>
                </span>
                {g.resolved && (
                  <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    resolved
                  </span>
                )}
              </button>

              {expanded === g.fingerprint && (
                <div className="border-t border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 flex justify-end">
                    {!g.resolved && (
                      <button
                        type="button"
                        onClick={() => void resolve(g.fingerprint)}
                        className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Mark resolved
                      </button>
                    )}
                  </div>
                  {samples.map((s) => (
                    <div key={s.id} className="mb-2 rounded-xl bg-white p-3">
                      <div className="mb-1 text-[11px] text-gray-400">
                        {new Date(s.occurred_at).toLocaleString()} · {s.level}
                        {s.status_code ? ` · ${s.status_code}` : ""}
                        {s.user_role ? ` · ${s.user_role}` : ""}
                      </div>
                      <div className="text-xs font-medium text-gray-800">{s.message}</div>
                      {s.context && Object.keys(s.context).length > 0 && (
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
                          {JSON.stringify(s.context)}
                        </pre>
                      )}
                      {s.stack && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-gray-500">Stack</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-900 p-2 text-[11px] leading-relaxed text-gray-100">
                            {s.stack}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

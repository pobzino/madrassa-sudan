'use client';

/**
 * Version history for a lesson recording. Every re-record, splice, trim or
 * delete leaves the previous state here (written by a database trigger), so a
 * tutor who makes things worse can go back.
 *
 * Shown in SimReviewModal's edit mode, alongside the "Fix a mistake" panel.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SimPayload } from '@/lib/sim.types';

interface SimVersion {
  id: string;
  version_number: number;
  duration_ms: number;
  event_count: number;
  cut_count: number;
  reason: string;
  restorable: boolean;
  created_at: string;
}

interface SimVersionHistoryProps {
  lessonId: string;
  /** Bump to refetch (e.g. after a splice). */
  refreshKey?: number;
  onRestored: (payload: SimPayload) => void;
}

const REASON_LABELS: Record<string, string> = {
  patched: 'before a slide was re-recorded',
  edited: 'before a trim or cut',
  restored: 'before a restore',
  replaced: 'before being replaced',
  deleted: 'before the recording was deleted',
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SimVersionHistory({
  lessonId,
  refreshKey = 0,
  onRestored,
}: SimVersionHistoryProps) {
  const [versions, setVersions] = useState<SimVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/sims/versions`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Could not load history');
        return;
      }
      setVersions(body.versions ?? []);
      setError(null);
    } catch {
      setError('Could not load history');
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const restore = async (version: SimVersion) => {
    const ok = window.confirm(
      `Restore version ${version.version_number} (${formatClock(version.duration_ms)})? ` +
        'The current recording is saved to history first, so this can be undone.'
    );
    if (!ok) return;

    setRestoringId(version.id);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/sims/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ version_id: version.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.sim) {
        throw new Error(body?.error || `Restore failed (${res.status})`);
      }
      toast.success(`Restored version ${version.version_number}`);
      onRestored(body.sim as SimPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      toast.error(message);
      setError(message);
    } finally {
      setRestoringId(null);
    }
  };

  if (error && !versions) {
    return <p className="text-xs text-red-600">{error}</p>;
  }
  if (!versions) {
    return <p className="text-xs text-gray-400">Loading history…</p>;
  }

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Version history</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {versions.length === 0
            ? 'No earlier versions yet — this is the original recording.'
            : 'Every change keeps the previous recording. Restoring is itself undoable.'}
        </p>
      </div>

      {versions.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center gap-3 bg-white px-3 py-2">
              <span className="w-8 shrink-0 text-center text-[11px] font-bold text-gray-400">
                v{version.version_number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800">
                  {formatClock(version.duration_ms)}
                  <span className="text-gray-400">
                    {' · '}
                    {version.event_count} events
                    {version.cut_count > 0 ? ` · ${version.cut_count} cuts` : ''}
                  </span>
                </p>
                <p className="truncate text-[11px] text-gray-400">
                  {formatWhen(version.created_at)} — {REASON_LABELS[version.reason] ?? version.reason}
                </p>
              </div>
              {version.restorable ? (
                <button
                  type="button"
                  disabled={restoringId !== null}
                  onClick={() => restore(version)}
                  className="shrink-0 rounded-lg border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40"
                >
                  {restoringId === version.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : (
                <span
                  className="shrink-0 text-[11px] text-gray-400"
                  title="The audio for this version has been cleared to save space"
                >
                  audio cleared
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

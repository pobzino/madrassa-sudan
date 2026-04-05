'use client';

/**
 * Sim watch lab — loads a real persisted sim by id and mounts <SimPlayer>.
 *
 * Route: /sim-lab/watch/[lessonId]/[simId]
 *
 * This is a developer-facing test harness for the Phase 2 SimPlayer. It
 * fetches the sim via the teacher API (so auth is required) and hands the
 * resulting SimPayload to the player.
 */

import { use, useEffect, useState } from 'react';
import SimPlayer from '@/components/slides/SimPlayer';
import type { SimPayload } from '@/lib/sim.types';

interface PageProps {
  params: Promise<{ lessonId: string; simId: string }>;
}

export default function SimWatchPage({ params }: PageProps) {
  const { lessonId, simId } = use(params);
  const [payload, setPayload] = useState<SimPayload | null>(null);
  const [language, setLanguage] = useState<'ar' | 'en'>('en');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/teacher/lessons/${lessonId}/sims/${simId}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return (await res.json()) as SimPayload;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load sim');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId, simId]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sim watch lab</h1>
            <p className="text-xs text-slate-500 font-mono">
              lesson {lessonId} · sim {simId}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1"
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </header>

        {loading && (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-500">
            Loading sim…
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700">
            {error}
          </div>
        )}

        {payload && !loading && !error && (
          <SimPlayer payload={payload} language={language} />
        )}
      </div>
    </div>
  );
}

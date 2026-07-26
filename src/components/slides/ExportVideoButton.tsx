'use client';

/**
 * ExportVideoButton — teacher-side "lesson to MP4" control in the slides
 * toolbar.
 *
 * Fetches the saved sim payload (with a fresh signed audio URL) on click and
 * renders the MP4 entirely in the teacher's browser via the client-side
 * WebCodecs exporter. Nothing is uploaded or stored.
 *
 * (The Remotion pipeline in remotion/ + scripts/render-lesson-video.mjs
 * remains available as CLI batch tooling for pre-producing videos.)
 */

import { useCallback } from 'react';
import type { SimPayload } from '@/lib/sim.types';
import SimVideoExportButton from '@/components/lessons/SimVideoExportButton';

const SECONDARY_BUTTON_CLASS =
  'px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50';

interface ExportVideoButtonProps {
  lessonId: string;
  language: 'ar' | 'en';
}

export default function ExportVideoButton({ lessonId, language }: ExportVideoButtonProps) {
  // Fetch on click (not mount) so the signed audio URL is always fresh —
  // they expire after 6 hours and the editor tab can live longer than that.
  const getPayload = useCallback(async (): Promise<SimPayload | null> => {
    const res = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sim?: SimPayload | null };
    return body.sim ?? null;
  }, [lessonId]);

  return (
    <SimVideoExportButton
      getPayload={getPayload}
      language={language}
      label="Export MP4"
      filename="lesson-video"
      className={SECONDARY_BUTTON_CLASS}
    />
  );
}

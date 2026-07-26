'use client';

/**
 * Dev-only harness for the client-side video exporter.
 *
 * Loads a sim payload fixture from /video-export-fixture.json (generated
 * ad-hoc from a local lesson — not committed), runs exportSimVideo, and
 * exposes the result on `window.__EXPORT_RESULT` / `__EXPORT_ERROR` so a
 * headless browser (Playwright) can assert on and save the produced MP4.
 *
 * Renders nothing useful in production.
 */

import { useEffect, useState } from 'react';
import type { SimPayload } from '@/lib/sim.types';
import { exportSimVideo } from '@/lib/video-export/export-sim-video';

declare global {
  interface Window {
    __EXPORT_RESULT?: { url: string; size: number; durationMs: number };
    __EXPORT_ERROR?: string;
  }
}

// Module-level guard: React StrictMode double-invokes effects in dev.
let started = false;

export default function VideoExportTestPage() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || started) return;
    started = true;
    (async () => {
      try {
        const res = await fetch('/video-export-fixture.json');
        if (!res.ok) throw new Error(`fixture missing (HTTP ${res.status})`);
        const payload = (await res.json()) as SimPayload;
        const result = await exportSimVideo(payload, {
          language: 'ar',
          onProgress: (p) => setStatus(`${p.phase} ${p.percent}%`),
        });
        window.__EXPORT_RESULT = {
          url: URL.createObjectURL(result.blob),
          size: result.blob.size,
          durationMs: result.durationMs,
        };
        setStatus(`done size=${result.blob.size} duration=${result.durationMs}ms`);
      } catch (error) {
        window.__EXPORT_ERROR = String(
          error instanceof Error ? (error.stack ?? error.message) : error
        );
        setStatus(`error: ${String(error)}`);
      }
    })();
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return <div>Not available.</div>;
  }
  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }} data-status={status}>
      video-export-test: {status}
    </div>
  );
}

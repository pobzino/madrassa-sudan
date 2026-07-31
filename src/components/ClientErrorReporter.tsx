'use client';

/**
 * Catches browser errors nobody currently sees: uncaught exceptions and
 * unhandled promise rejections. Mounted once, app-wide.
 *
 * Renders nothing and reports fire-and-forget, so it cannot affect what a child
 * sees on screen.
 */

import { useEffect } from 'react';
import { reportClientError } from '@/lib/observability/report-client-error';

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError({
        error: event.error ?? event.message,
        context: {
          kind: 'uncaught',
          // Where in the bundle, not what the user typed.
          source_file: event.filename ? String(event.filename).slice(0, 200) : null,
          line: event.lineno ?? null,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError({
        error: event.reason,
        context: { kind: 'unhandled_rejection' },
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

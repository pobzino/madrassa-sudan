"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackAnalyticsEvent("app_error", {
      error_type: error.digest ? `global_${error.digest}` : "global_render",
    });
  }, [error.digest]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-md border-y border-gray-200 bg-white py-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-3 text-sm text-gray-600">
              Try loading Amal School again. Contact admin@amalschool.org if the problem continues.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

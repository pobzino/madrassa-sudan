"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackAnalyticsEvent("app_error", {
      error_type: error.digest ? `dashboard_${error.digest}` : "dashboard_render",
    });
  }, [error.digest]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-lg w-full text-center">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-600 mb-4">Please try again. If the problem continues, contact admin@amalschool.org.</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

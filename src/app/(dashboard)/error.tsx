"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-lg w-full text-center">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-600 mb-1">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-red-400 mb-4">Digest: {error.digest}</p>
        )}
        <pre className="text-xs text-left bg-red-100 rounded-lg p-3 mb-4 overflow-auto max-h-40 text-red-700">
          {error.stack}
        </pre>
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

import { Suspense } from "react";
import type { Metadata } from "next";
import { OfflinePlayerFromSearchParams, OfflinePlayerSkeleton } from "@/components/offline/OfflineLessonPlayer";

// One static, user-agnostic shell for every saved lesson: the service worker
// caches this HTML and serves it offline, and the lesson id is read from
// `?id=` in the browser (useSearchParams, inside Suspense, so the rest of the
// page is still prerendered). Outside (dashboard) and the proxy's protected
// paths, so nothing here needs a session.
export const metadata: Metadata = {
  title: "Saved lesson | Amal School",
  robots: { index: false, follow: false },
};

export default function OfflinePlayPage() {
  return (
    <Suspense fallback={<OfflinePlayerSkeleton />}>
      <OfflinePlayerFromSearchParams />
    </Suspense>
  );
}

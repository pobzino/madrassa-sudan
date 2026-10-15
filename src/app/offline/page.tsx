import type { Metadata } from "next";
import OfflineHub from "@/components/offline/OfflineHub";

// Static and user-agnostic: the service worker caches this HTML and serves it
// whenever a navigation fails, and the hub reads the saved lessons from this
// phone in the browser. No server data, no session needed.
export const metadata: Metadata = {
  title: "Saved lessons | Amal School",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <OfflineHub />;
}

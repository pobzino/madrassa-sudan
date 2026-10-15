import type { Metadata } from "next";
import { AppInstallLanding } from "@/components/pwa/AppInstallLanding";

export const metadata: Metadata = {
  title: "Get the Amal app | مدرسة آمال",
  description: "Put Amal School on your phone's home screen and open your lessons in one tap. Free, with no app store needed.",
  alternates: { canonical: "/app" },
};

// The link to share with families: amalschool.org/app (add ?lang=ar for Arabic).
export default function AppPage() {
  return <AppInstallLanding />;
}

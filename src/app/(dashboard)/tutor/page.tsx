import { redirect } from "next/navigation";

// The AI tutor has been removed to keep the platform simple for the first cohort.
// Any old bookmarks or links to /tutor now land on the dashboard.
export default function TutorRedirectPage() {
  redirect("/dashboard");
}

import type { Metadata } from "next";
import SampleLessonExperience from "@/components/sample/SampleLessonExperience";
import { loadSampleLesson } from "@/lib/server/sample-lesson";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Counting from 0 to 10 | Amal School Sample Lesson",
  description: "Try a real Amal School Grade 1 Mathematics lesson without creating an account.",
};

export default async function SampleLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string }>;
}) {
  const query = await searchParams;
  const sampleLesson = await loadSampleLesson();
  return <SampleLessonExperience data={sampleLesson} startInPractice={query.practice === "1"} />;
}

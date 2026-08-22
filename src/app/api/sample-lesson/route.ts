import { NextResponse } from "next/server";
import { loadSampleLesson } from "@/lib/server/sample-lesson";

export async function GET() {
  try {
    const sample = await loadSampleLesson();
    return NextResponse.json(
      {
        ...sample,
        practice: {
          ...sample.practice,
          questions: sample.practice.questions.slice(0, 1),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Load homepage sample lesson error:", error);
    return NextResponse.json({ error: "Sample lesson unavailable" }, { status: 503 });
  }
}

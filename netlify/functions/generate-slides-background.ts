import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import {
  generateSlidesForLesson,
  SlideGenerationError,
} from "../../src/lib/server/slide-deck-generator";

export async function handler(event: {
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  const requestSecret = event.headers["x-slide-job-secret"];
  const expectedSecret =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

  if (!requestSecret || !expectedSecret || requestSecret !== expectedSecret) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !expectedSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Supabase configuration" }),
    };
  }

  const payload = event.body ? JSON.parse(event.body) : null;
  const lessonId = typeof payload?.lessonId === "string" ? payload.lessonId : null;
  const userId = typeof payload?.userId === "string" ? payload.userId : null;
  const slideCount =
    typeof payload?.slideCount === "number" && Number.isFinite(payload.slideCount)
      ? payload.slideCount
      : null;
  const languageMode =
    payload?.languageMode === "ar" ||
    payload?.languageMode === "en" ||
    payload?.languageMode === "both"
      ? payload.languageMode
      : "ar";
  const generationContext =
    payload?.generationContext && typeof payload.generationContext === "object"
      ? payload.generationContext
      : null;

  if (!lessonId || !userId || slideCount == null) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing background generation payload" }),
    };
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    expectedSecret,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  try {
    await generateSlidesForLesson({
      supabase,
      lessonId,
      userId,
      requestedSlideCount: slideCount,
      languageMode,
      generationContext,
    });

    return {
      statusCode: 202,
      body: JSON.stringify({ queued: true }),
    };
  } catch (error) {
    console.error("Background slide generation failed:", error);

    if (error instanceof SlideGenerationError) {
      return {
        statusCode: error.status,
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Background slide generation failed" }),
    };
  }
}

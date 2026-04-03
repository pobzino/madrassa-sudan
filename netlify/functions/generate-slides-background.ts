import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import {
  generateSlidesForLesson,
  SlideGenerationError,
} from "../../src/lib/server/slide-deck-generator";
import type { SlideGenerationContext } from "../../src/lib/slides-generation";

export async function handler(event: {
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  const expectedSecret =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

  let payload: Record<string, unknown> | null = null;

  try {
    payload = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : null;
  } catch (error) {
    console.error("Background slide generation received invalid JSON:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid background generation payload" }),
    };
  }

  const requestSecret =
    event.headers["x-slide-job-secret"] ||
    event.headers["X-Slide-Job-Secret"] ||
    (typeof payload?.internalSecret === "string" ? payload.internalSecret : "");

  console.log("Background slide generation invoked", {
    hasExpectedSecret: Boolean(expectedSecret),
    hasRequestSecret: Boolean(requestSecret),
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });

  if (!requestSecret || !expectedSecret || requestSecret !== expectedSecret) {
    console.error("Background slide generation unauthorized", {
      hasExpectedSecret: Boolean(expectedSecret),
      hasRequestSecret: Boolean(requestSecret),
      headerKeys: Object.keys(event.headers || {}),
    });
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
      ? (payload.generationContext as SlideGenerationContext)
      : null;

  if (!lessonId || !userId || slideCount == null) {
    console.error("Background slide generation missing payload fields", {
      lessonId,
      userId,
      slideCount,
      languageMode,
    });
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
    console.log("Background slide generation started", {
      lessonId,
      userId,
      slideCount,
      languageMode,
    });

    await generateSlidesForLesson({
      supabase,
      lessonId,
      userId,
      requestedSlideCount: slideCount,
      languageMode,
      generationContext,
    });

    console.log("Background slide generation completed", {
      lessonId,
      userId,
      slideCount,
      languageMode,
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

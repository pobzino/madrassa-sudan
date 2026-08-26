import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import {
  generateSlidesForLesson,
  SlideGenerationError,
} from "../../src/lib/server/slide-deck-generator";
import type { SlideGenerationContext } from "../../src/lib/slides-generation";

function logSlideJob(level: "log" | "warn" | "error", message: string, details: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ message, ...details }));
}

function secretsMatch(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function handler(event: {
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const slideJobSecret = process.env.SLIDE_JOB_SECRET?.trim() || "";

  let payload: Record<string, unknown> | null = null;

  try {
    payload = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : null;
  } catch (error) {
    logSlideJob("error", "Background slide generation received invalid JSON", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid background generation payload" }),
    };
  }

  const requestSecret =
    event.headers["x-slide-job-secret"] ||
    event.headers["X-Slide-Job-Secret"] ||
    "";
  const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken : "";

  logSlideJob("log", "Background slide generation invoked", {
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasPublishableKey: Boolean(publishableKey),
    hasRequestSecret: Boolean(requestSecret),
    hasAccessToken: Boolean(accessToken),
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceRoleKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Supabase configuration" }),
    };
  }

  const usesInternalSecret =
    Boolean(requestSecret) && Boolean(slideJobSecret) && secretsMatch(requestSecret, slideJobSecret);

  let authenticatedUserId: string | null = null;

  if (usesInternalSecret) {
      logSlideJob("log", "Background slide generation authenticated via internal secret");
  } else {
    if (!publishableKey || !accessToken) {
      logSlideJob("error", "Background slide generation missing auth token", {
        hasPublishableKey: Boolean(publishableKey),
        hasAccessToken: Boolean(accessToken),
        headerKeys: Object.keys(event.headers || {}),
      });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const authClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      logSlideJob("error", "Background slide generation access token verification failed", {
        error: authError?.message ?? null,
      });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    authenticatedUserId = user.id;
    logSlideJob("log", "Background slide generation authenticated via access token", {
      userId: authenticatedUserId,
    });
  }

  if (!requestSecret && !accessToken) {
    logSlideJob("error", "Background slide generation unauthorized", {
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasRequestSecret: Boolean(requestSecret),
      hasAccessToken: Boolean(accessToken),
      headerKeys: Object.keys(event.headers || {}),
    });
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized" }),
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
    logSlideJob("error", "Background slide generation missing payload fields", {
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

  if (authenticatedUserId && authenticatedUserId !== userId) {
    logSlideJob("error", "Background slide generation user mismatch", {
      authenticatedUserId,
      userId,
    });
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Forbidden" }),
    };
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  try {
    logSlideJob("log", "Background slide generation started", {
      lessonId,
      userId,
      slideCount,
      languageMode,
      queuedAt: typeof payload?.queuedAt === "string" ? payload.queuedAt : null,
    });

    // Skip speaker notes — they'll be enriched by a follow-up request
    // after the client receives the initial deck.
    await generateSlidesForLesson({
      supabase,
      lessonId,
      userId,
      requestedSlideCount: slideCount,
      languageMode,
      generationContext,
      skipSpeakerNotes: true,
    });

    logSlideJob("log", "Background slide generation completed", {
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
    logSlideJob("error", "Background slide generation failed", {
      lessonId,
      userId,
      slideCount,
      languageMode,
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : null,
      status: error instanceof SlideGenerationError ? error.status : null,
    });

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

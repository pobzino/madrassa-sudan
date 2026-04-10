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
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

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
  const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken : "";

  console.log("Background slide generation invoked", {
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
    Boolean(requestSecret) && Boolean(serviceRoleKey) && requestSecret === serviceRoleKey;

  let authenticatedUserId: string | null = null;

  if (usesInternalSecret) {
    console.log("Background slide generation authenticated via internal secret");
  } else {
    if (!publishableKey || !accessToken) {
      console.error("Background slide generation missing auth token", {
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
      console.error("Background slide generation access token verification failed", authError);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    authenticatedUserId = user.id;
    console.log("Background slide generation authenticated via access token", {
      userId: authenticatedUserId,
    });
  }

  if (!requestSecret && !accessToken) {
    console.error("Background slide generation unauthorized", {
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

  if (authenticatedUserId && authenticatedUserId !== userId) {
    console.error("Background slide generation user mismatch", {
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
    console.log("Background slide generation started", {
      lessonId,
      userId,
      slideCount,
      languageMode,
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleKey } from "@/lib/supabase/service";
import {
  clampSlideCount,
  parseSlideGenerationContext,
  suggestSlideCount,
} from "@/lib/slides-generation";
import {
  generateSlidesForLesson,
  SlideGenerationError,
} from "@/lib/server/slide-deck-generator";

export const maxDuration = 120;

function shouldUseBackgroundGeneration(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  return hostname !== "localhost" && hostname !== "127.0.0.1";
}

type QueueOutcome =
  | { ok: true }
  | { ok: false; status: number; message: string };

async function queueBackgroundGeneration({
  request,
  lessonId,
  userId,
  accessToken,
  slideCount,
  languageMode,
  generationContext,
}: {
  request: NextRequest;
  lessonId: string;
  userId: string;
  accessToken: string | null;
  slideCount: number;
  languageMode: "ar" | "en";
  generationContext: ReturnType<typeof parseSlideGenerationContext>;
}): Promise<QueueOutcome> {
  const internalSecret = getServiceRoleKey();
  if (!internalSecret && !accessToken) {
    return {
      ok: false,
      status: 500,
      message: "Missing background generation credentials",
    };
  }

  const backgroundUrl = new URL("/.netlify/functions/generate-slides-background", request.url);

  // Netlify background functions acknowledge with 202 almost instantly.
  // Use a short timeout so we never block the parent route beyond the
  // serverless gateway limit. If the timeout trips, we optimistically
  // assume the background worker picked up the request — the client
  // polls for the saved deck and recovers either way.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const enqueueResponse = await fetch(backgroundUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(internalSecret ? { "x-slide-job-secret": internalSecret } : {}),
      },
      body: JSON.stringify({
        lessonId,
        userId,
        slideCount,
        languageMode,
        generationContext,
        internalSecret,
        accessToken,
      }),
    });

    if (!enqueueResponse.ok) {
      const errorText = await enqueueResponse.text().catch(() => "");
      console.error("Queue background slide generation failed:", {
        status: enqueueResponse.status,
        body: errorText.slice(0, 500),
      });
      return {
        ok: false,
        status: enqueueResponse.status === 401 || enqueueResponse.status === 403 ? 401 : 502,
        message:
          enqueueResponse.status === 401 || enqueueResponse.status === 403
            ? "Background worker rejected credentials"
            : "Background worker could not be queued",
      };
    }

    return { ok: true };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.warn("Background slide queue fetch timed out; returning 202 optimistically");
      // Trust that the background worker received the invocation.
      return { ok: true };
    }
    console.error("Background slide queue fetch errored:", error);
    return {
      ok: false,
      status: 502,
      message: "Background worker unreachable",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const enrichNotesOnly = body.enrich_notes === true;
    const generationContext = parseSlideGenerationContext(body.generation_context);
    const requestedSlideCount =
      typeof body.slide_count === "number" && Number.isFinite(body.slide_count)
        ? body.slide_count
        : generationContext?.requestedSlideCount ??
          suggestSlideCount(generationContext?.lessonDurationMinutes ?? null);
    const slideCount = clampSlideCount(requestedSlideCount || 10);
    const languageMode = body.language_mode === "en" ? "en" : "ar";

    // Phase 2: Enrich existing slides with speaker notes (separate request)
    if (enrichNotesOnly) {
      const slides = await generateSlidesForLesson({
        supabase,
        lessonId,
        userId: user.id,
        generationContext,
        requestedSlideCount: slideCount,
        languageMode,
        enrichNotesOnly: true,
      });
      return NextResponse.json({ slides });
    }

    // Phase 1: Generate deck (skip speaker notes for speed).
    // In production, always use the background Netlify function to avoid
    // the gateway timeout. The client polls for the saved deck.
    if (shouldUseBackgroundGeneration(request)) {
      const outcome = await queueBackgroundGeneration({
        request,
        lessonId,
        userId: user.id,
        accessToken: session?.access_token ?? null,
        slideCount,
        languageMode,
        generationContext,
      });

      if (outcome.ok) {
        return NextResponse.json({ queued: true }, { status: 202 });
      }

      // Never fall through to inline generation in production — it would
      // exceed the serverless gateway timeout and surface as a 504.
      return NextResponse.json({ error: outcome.message }, { status: outcome.status });
    }

    const slides = await generateSlidesForLesson({
      supabase,
      lessonId,
      userId: user.id,
      generationContext,
      requestedSlideCount: slideCount,
      languageMode,
      skipSpeakerNotes: true,
    });

    return NextResponse.json({ slides, notes_pending: true });
  } catch (error) {
    console.error("Generate slides error:", error);

    if (error instanceof SlideGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
import type { SlideGenerationEvent } from "@/lib/server/slide-deck-generator";

export const maxDuration = 120;

function shouldUseBackgroundGeneration(_request: NextRequest) {
  // Disabled: streaming SSE with maxDuration=120 works in production.
  // The background Netlify function is kept as dead code for now in case
  // we need to revert.
  return false;
}

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
}) {
  const internalSecret = getServiceRoleKey();
  if (!internalSecret && !accessToken) {
    throw new SlideGenerationError("Missing background generation credentials", 500);
  }

  const backgroundUrl = new URL("/.netlify/functions/generate-slides-background", request.url);
  const enqueueResponse = await fetch(backgroundUrl, {
    method: "POST",
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
    const errorText = await enqueueResponse.text();
    console.error("Queue background slide generation failed:", errorText);
    return null;
  }

  return NextResponse.json({ queued: true }, { status: 202 });
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
    const generationContext = parseSlideGenerationContext(body.generation_context);
    const requestedSlideCount =
      typeof body.slide_count === "number" && Number.isFinite(body.slide_count)
        ? body.slide_count
        : generationContext?.requestedSlideCount ??
          suggestSlideCount(generationContext?.lessonDurationMinutes ?? null);
    const slideCount = clampSlideCount(requestedSlideCount || 10);
    const languageMode = body.language_mode === "en" ? "en" : "ar";

    if (shouldUseBackgroundGeneration(request)) {
      const queuedResponse = await queueBackgroundGeneration({
        request,
        lessonId,
        userId: user.id,
        accessToken: session?.access_token ?? null,
        slideCount,
        languageMode,
        generationContext,
      });

      if (queuedResponse) {
        return queuedResponse;
      }
    }

    // Stream SSE events so the client sees slides as soon as the deck is ready,
    // before speaker notes are generated.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (chunk: string) => {
          try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ }
        };

        const send = (event: SlideGenerationEvent) => {
          enqueue(`data: ${JSON.stringify(event)}\n\n`);
        };

        // Send keepalive comments every 3s during long AI calls so proxies
        // (Netlify, Cloudflare, Nginx) don't buffer or timeout the stream.
        const heartbeat = setInterval(() => enqueue(": keepalive\n\n"), 3000);

        try {
          // Initial comment to flush headers through any proxy
          enqueue(": stream-start\n\n");

          await generateSlidesForLesson({
            supabase,
            lessonId,
            userId: user.id,
            generationContext,
            requestedSlideCount: slideCount,
            languageMode,
            onProgress: send,
          });
        } catch (error) {
          console.error("Generate slides error:", error);
          const message =
            error instanceof SlideGenerationError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Generation failed";
          send({ type: "error", message });
        } finally {
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Generate slides error:", error);

    if (error instanceof SlideGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

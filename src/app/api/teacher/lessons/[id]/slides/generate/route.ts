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

export const maxDuration = 30;

function shouldUseBackgroundGeneration() {
  return process.env.NETLIFY === "true";
}

async function queueBackgroundGeneration({
  request,
  lessonId,
  userId,
  slideCount,
  languageMode,
  generationContext,
}: {
  request: NextRequest;
  lessonId: string;
  userId: string;
  slideCount: number;
  languageMode: "ar" | "en" | "both";
  generationContext: ReturnType<typeof parseSlideGenerationContext>;
}) {
  const internalSecret = getServiceRoleKey();
  if (!internalSecret) {
    throw new SlideGenerationError("Missing internal generation secret", 500);
  }

  const backgroundUrl = new URL("/.netlify/functions/generate-slides-background", request.url);
  const enqueueResponse = await fetch(backgroundUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slide-job-secret": internalSecret,
    },
    body: JSON.stringify({
      lessonId,
      userId,
      slideCount,
      languageMode,
      generationContext,
    }),
  });

  if (!enqueueResponse.ok) {
    const errorText = await enqueueResponse.text();
    console.error("Queue background slide generation failed:", errorText);
    throw new SlideGenerationError("Failed to queue slide generation", 502);
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
    const languageMode =
      body.language_mode === "ar" || body.language_mode === "en" || body.language_mode === "both"
        ? body.language_mode
        : "ar";

    if (shouldUseBackgroundGeneration()) {
      return await queueBackgroundGeneration({
        request,
        lessonId,
        userId: user.id,
        slideCount,
        languageMode,
        generationContext,
      });
    }

    const slides = await generateSlidesForLesson({
      supabase,
      lessonId,
      userId: user.id,
      generationContext,
      requestedSlideCount: slideCount,
      languageMode,
    });

    return NextResponse.json({ slides });
  } catch (error) {
    console.error("Generate slides error:", error);

    if (error instanceof SlideGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

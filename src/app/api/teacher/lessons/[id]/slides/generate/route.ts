import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clampSlideCount,
  parseSlideGenerationContext,
  suggestSlideCount,
} from "@/lib/slides-generation";
import {
  generateSlidesForLesson,
  SlideGenerationError,
} from "@/lib/server/slide-deck-generator";

// Deck generation: ~20-30s. Notes enrichment: ~10-15s.
export const maxDuration = 120;

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
    const enrichNotesOnly = body.enrich_notes === true;
    const generationContext = parseSlideGenerationContext(body.generation_context);
    const requestedSlideCount =
      typeof body.slide_count === "number" && Number.isFinite(body.slide_count)
        ? body.slide_count
        : generationContext?.requestedSlideCount ??
          suggestSlideCount(generationContext?.lessonDurationMinutes ?? null);
    const slideCount = clampSlideCount(requestedSlideCount || 10);
    const languageMode = body.language_mode === "en" ? "en" : "ar";

    if (enrichNotesOnly) {
      // Phase 2: Enrich existing slides with speaker notes
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

    // Phase 1: Generate deck, skip speaker notes for speed
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

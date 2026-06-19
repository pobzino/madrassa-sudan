import type { Slide } from "@/lib/slides.types";

/**
 * Extracts text content from a sim's deck snapshot for AI prompt building.
 * Shared by the lesson-based and week-based homework generators.
 */
export function extractSlideContent(deck: Slide[]): string {
  return deck
    .map((slide, i) => {
      const parts: string[] = [`Slide ${i + 1} (${slide.type}):`];
      const title = slide.title_ar || slide.title_en;
      if (title) parts.push(`  Title: ${title}`);
      const body = slide.body_ar || slide.body_en;
      if (body) parts.push(`  Content: ${body}`);
      const bullets = slide.bullets_ar?.length ? slide.bullets_ar : slide.bullets_en;
      if (bullets?.length) parts.push(`  Key points: ${bullets.join("; ")}`);
      const notes = slide.speaker_notes_ar || slide.speaker_notes_en;
      if (notes) parts.push(`  Speaker notes: ${notes}`);
      if (slide.interaction_type) {
        const prompt = slide.interaction_prompt_ar || slide.interaction_prompt_en;
        parts.push(`  Activity: ${slide.interaction_type}${prompt ? ` — "${prompt}"` : ""}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

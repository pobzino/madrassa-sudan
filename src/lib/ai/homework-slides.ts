import type { Slide } from "@/lib/slides.types";

/**
 * Extracts text content from a sim's deck snapshot for AI prompt building.
 * Shared by the lesson-based and week-based homework generators.
 */
export function extractSlideContent(
  deck: Slide[],
  options: { language?: 'ar' | 'en'; includeSpeakerNotes?: boolean } = {}
): string {
  const localized = (ar: string, en: string) => options.language === 'ar' ? ar
    : options.language === 'en' ? en : ar || en;
  return deck
    .map((slide, i) => {
      const parts: string[] = [`Slide ${i + 1} (${slide.type}):`];
      const title = localized(slide.title_ar, slide.title_en);
      if (title) parts.push(`  Title: ${title}`);
      const body = localized(slide.body_ar, slide.body_en);
      if (body) parts.push(`  Content: ${body}`);
      const bullets = options.language ? slide[`bullets_${options.language}`]
        : slide.bullets_ar?.length ? slide.bullets_ar : slide.bullets_en;
      if (bullets?.length) parts.push(`  Key points: ${bullets.join("; ")}`);
      const notes = localized(slide.speaker_notes_ar, slide.speaker_notes_en);
      if (notes && options.includeSpeakerNotes !== false) parts.push(`  Speaker notes: ${notes}`);
      if (slide.interaction_type) {
        const prompt = localized(slide.interaction_prompt_ar || '', slide.interaction_prompt_en || '');
        parts.push(`  Activity: ${slide.interaction_type}${prompt ? ` — "${prompt}"` : ""}`);
      }
      return parts.length > 1 ? parts.join("\n") : '';
    })
    .filter(Boolean)
    .join("\n\n");
}

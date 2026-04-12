/**
 * Prompt builder for AI slide image generation.
 *
 * Produces flat-vector children's educational illustrations. When characters
 * appear, they must represent Sudanese children — warm brown skin tones,
 * natural or braided hair, culturally grounded clothing, shown with dignity
 * and joy. The app is for Sudanese learners and the imagery should reflect
 * that.
 */

interface SlideImagePromptInput {
  /** What the teacher (or auto-populated default) typed. */
  userPrompt: string;
  /** Optional slide title for extra context. */
  slideTitle?: string | null;
  /** Optional idea focus / key concept from the slide. */
  ideaFocus?: string | null;
}

const STYLE = [
  'Flat 2D vector cartoon illustration for a children\'s educational lesson slide.',
  'Solid flat colors, thick clean outlines, simple rounded shapes, bright friendly saturated palette.',
  'Similar look to modern flat vector children\'s book illustrations and educational apps.',
  'NO photorealism, NO 3D rendering, NO gradients, NO textures, NO depth-of-field, NO realistic lighting.',
  'Avoid stray decorative text or labels unless the lesson prompt explicitly asks for them.',
].join(' ');

const EDUCATIONAL_SYMBOL_KEYWORDS = [
  'number',
  'numbers',
  'numeral',
  'numerals',
  'digit',
  'digits',
  'count',
  'counting',
  'equation',
  'fraction',
  'math',
  'letter',
  'letters',
  'word',
  'words',
  'label',
  'labels',
  'alphabet',
  'card',
  'cards',
];

function requestsWrittenSymbols(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\d/.test(normalized) || EDUCATIONAL_SYMBOL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

const SUDANESE_CHARACTER_GUIDE = [
  'IF the scene includes any human characters (children, students, teachers, adults, or any people):',
  'Depict them as Sudanese — warm brown to dark brown skin tones (show a natural range, not a single shade),',
  'natural textured hair (afros, cornrows, braids, twists) or neatly covered heads,',
  'some girls and women wearing colorful Sudanese headscarves (tarha) or toub in vibrant patterns,',
  'boys and men in simple jalabiya robes or modern casual clothes / school uniforms,',
  'school-aged children in clean, colorful, age-appropriate outfits.',
  'Show characters as happy, engaged, curious, and dignified — never caricatured, never stereotyped.',
  'Reflect the warmth and everyday normalcy of Sudanese life.',
  'Do NOT depict characters as light-skinned, European, or East Asian — this app is for Sudanese learners and the imagery must represent them.',
].join(' ');

/**
 * Builds the full prompt sent to openai.images.generate.
 */
export function buildSlideImagePrompt({
  userPrompt,
  slideTitle,
  ideaFocus,
}: SlideImagePromptInput): string {
  const cleaned = userPrompt.trim();
  const title = slideTitle?.trim();
  const focus = ideaFocus?.trim();

  const contextParts: string[] = [];
  if (title) contextParts.push(`Slide title: "${title}".`);
  if (focus && focus !== title) contextParts.push(`Key concept: ${focus}.`);
  const context = contextParts.join(' ');

  const subject = `Scene: ${cleaned}.`;
  const writingInstruction = requestsWrittenSymbols(cleaned)
    ? 'The teacher explicitly asked for educational symbols or labels. Include only the exact requested numbers, letters, words, or cards, make them large and legible, and do not add any extra text beyond what was requested.'
    : 'Do not include any visible text, letters, numerals, labels, or captions in the image.';

  return [STYLE, context, subject, writingInstruction, SUDANESE_CHARACTER_GUIDE]
    .filter(Boolean)
    .join('\n\n');
}

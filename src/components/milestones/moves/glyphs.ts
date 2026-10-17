/**
 * The little pictures the battle effects spawn as plain DOM (stars, sparks,
 * ticks, the counted things): the app's own SVG, never a text glyph or emoji.
 * All markup here is built from constants and our own icon set, so it is safe
 * to set as innerHTML.
 */
const STAR_PATH = "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8L12 3Z";
const SPARK_PATH = "M12 2l1.9 7.1L21 12l-7.1 2.9L12 22l-1.9-7.1L3 12l7.1-2.9L12 2Z";

function svg(size: number, inner: string, extra = ""): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${extra}>${inner}</svg>`;
}

/** A filled star with a soft glow (bursts, super hits). */
export function starSvg(size: number, color = "#FDE68A"): string {
  return svg(size, `<path d="${STAR_PATH}" fill="${color}" stroke="#F59E0B" stroke-width="1.2" stroke-linejoin="round"/>`, 'style="filter:drop-shadow(0 0 6px rgba(245,158,11,0.95))"');
}

/** A four-point spark (scroll shields, rune sparkles). */
export function sparkSvg(size: number, color = "#FDE68A"): string {
  return svg(size, `<path d="${SPARK_PATH}" fill="${color}"/>`, `style="filter:drop-shadow(0 0 6px ${color})"`);
}

/** A bold tick (the stamp shield). */
export function tickSvg(size: number, color = "#3B1D00"): string {
  return svg(size, `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`);
}

/** Puts a glyph into an element: SVG markup from this module / Countables, or plain text. */
export function setGlyph(el: HTMLElement, glyph: string) {
  if (!glyph) return;
  if (glyph.startsWith("<svg")) el.innerHTML = glyph;
  else el.textContent = glyph;
}

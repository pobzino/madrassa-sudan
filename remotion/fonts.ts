import type { CSSProperties } from 'react';
import { loadFont as loadCairo } from '@remotion/google-fonts/Cairo';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';

/**
 * In the Next app these fonts are injected by `next/font/google` in
 * src/app/layout.tsx as the CSS variables --font-inter / --font-cairo /
 * --font-fredoka, which globals.css then wires into the slide styles
 * (including the `[dir="rtl"] { font-family: var(--font-cairo) }` rule the
 * Arabic slide text depends on). Remotion has no Next layout, so we load the
 * same families here and re-declare the variables on the composition root.
 *
 * loadFont() integrates with delayRender — frames are not captured until the
 * fonts are ready.
 */
const cairo = loadCairo('normal', {
  subsets: ['arabic', 'latin'],
  weights: ['400', '600', '700', '800'],
});
const inter = loadInter('normal', {
  subsets: ['latin'],
  weights: ['400', '500', '600', '700'],
});
const fredoka = loadFredoka('normal', {
  subsets: ['latin'],
  weights: ['400', '500', '600', '700'],
});

export const fontVariables = {
  '--font-cairo': cairo.fontFamily,
  '--font-inter': inter.fontFamily,
  '--font-fredoka': fredoka.fontFamily,
} as CSSProperties;

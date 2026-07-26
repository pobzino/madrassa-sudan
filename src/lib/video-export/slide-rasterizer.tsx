'use client';

/**
 * Offscreen SlideCard rasterizer for client-side video export.
 *
 * Renders a slide (at a given playback visual state) into a hidden 1280x720
 * DOM container using the real SlideCard component — same CSS, same fonts,
 * same images the user is already looking at — then snapshots it to an
 * ImageBitmap via html-to-image.
 *
 * Slides are static between sim events, so the exporter only re-rasterizes
 * when the visual state changes (slide change, bullet reveal, answer
 * reveal/change), not per frame.
 */

import { createRoot, type Root } from 'react-dom/client';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import SlideCard from '@/components/slides/SlideCard';
import type { Slide } from '@/lib/slides.types';
import type { InteractionAnswer } from '@/lib/interactions/types';

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** The parts of the projected sim surface that change SlideCard's pixels. */
export interface SlideVisualState {
  slide: Slide;
  revealedBullets: number;
  answerRevealed: boolean;
  activityAnswer: InteractionAnswer | null;
}

/** Cache key for a visual state — two equal keys render identical pixels. */
export function visualStateKey(state: SlideVisualState): string {
  return [
    state.slide.id,
    state.revealedBullets,
    state.answerRevealed ? 1 : 0,
    state.activityAnswer === null ? '' : JSON.stringify(state.activityAnswer),
  ].join('|');
}

async function waitForImages(container: HTMLElement, timeoutMs: number) {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;
  await Promise.race([
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Two animation frames: React commit + browser layout/paint settle. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export interface SlideRasterizer {
  rasterize(state: SlideVisualState): Promise<ImageBitmap>;
  dispose(): void;
}

export async function createSlideRasterizer(
  language: 'ar' | 'en'
): Promise<SlideRasterizer> {
  // Two-level structure: the OUTER container is fixed offscreen, while the
  // INNER target (the node we actually snapshot) is statically positioned.
  // html-to-image clones the snapshot root with its inline styles — if we
  // snapshotted the fixed/left:-100000px container itself, the clone would
  // render offscreen inside the capture SVG and produce a blank image.
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${DESIGN_WIDTH}px`,
    height: `${DESIGN_HEIGHT}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  const target = document.createElement('div');
  Object.assign(target.style, {
    width: `${DESIGN_WIDTH}px`,
    height: `${DESIGN_HEIGHT}px`,
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(target);

  // Inside the snapshot target:
  //  - kill CSS animations/transitions so every rasterization captures the
  //    settled final state (entrance animations are re-applied
  //    deterministically at canvas-composite time);
  //  - hide scrollbars: on platforms with classic (layout-consuming)
  //    scrollbars, a scrollable element inside a slide would render
  //    scrollbar strips into the capture AND steal ~15px of layout width,
  //    reflowing text differently from the live overlay-scrollbar view.
  const styleKill = document.createElement('style');
  styleKill.textContent = [
    '[data-sim-export-root] *, [data-sim-export-root] *::before, [data-sim-export-root] *::after { animation: none !important; transition: none !important; scrollbar-width: none !important; }',
    '[data-sim-export-root] *::-webkit-scrollbar { display: none !important; }',
  ].join('\n');
  target.setAttribute('data-sim-export-root', '');
  document.body.appendChild(styleKill);
  document.body.appendChild(container);

  // The capture renders inside an SVG-image document where only fonts
  // embedded as data URLs exist — system fonts are unavailable. Heading
  // chains end in latin-only Fredoka/Inter + system fallbacks, so Arabic
  // heading glyphs would fall back to a metrically-different serif and
  // reflow the layout. Appending Cairo (embedded, Arabic-capable) to those
  // variables in the live container makes every element's computed
  // font-family — which html-to-image inlines into the clone — resolve to
  // embedded fonts for both scripts.
  const bodyStyles = getComputedStyle(document.body);
  const cairoFamily = bodyStyles.getPropertyValue('--font-cairo').trim();
  if (cairoFamily) {
    for (const variable of ['--font-fredoka', '--font-inter']) {
      const current = bodyStyles.getPropertyValue(variable).trim();
      if (current) {
        container.style.setProperty(variable, `${current}, ${cairoFamily}`);
      }
    }
  }

  const root: Root = createRoot(target);

  // Ensure web fonts are loaded before the first snapshot.
  await document.fonts.ready;
  // `cache: 'no-cache'` avoids CORS-cache poisoning: the page's <img> tags
  // load Supabase images without CORS, and the browser may otherwise serve
  // that cached no-CORS response to html-to-image's CORS fetch and fail,
  // silently rendering the image area blank in the export.
  const fetchRequestInit: RequestInit = { cache: 'no-cache' };
  // Font-embed CSS is computed once, lazily on the FIRST rasterize — after a
  // real slide is rendered, so the fonts actually used are discovered. (The
  // capture runs inside a detached SVG document where page fonts don't exist;
  // without embedded @font-face rules all text falls back to serif. Computing
  // it once also avoids html-to-image re-fetching fonts on every call.)
  let fontEmbedCSS: string | undefined;
  let fontEmbedReady = false;

  let disposed = false;

  return {
    async rasterize(state: SlideVisualState): Promise<ImageBitmap> {
      if (disposed) throw new Error('Rasterizer disposed');
      root.render(
        <SlideCard
          key={`${state.slide.id}:${language}`}
          slide={state.slide}
          language={language}
          chromeless
          revealedCount={state.revealedBullets}
          showActivityAnswer={state.answerRevealed}
          // Interactive mode renders the teacher's recorded demo answer on
          // activity slides; exploration slides stay static (their
          // interactive widgets are lazy-loaded and animated).
          activityInteractive={state.slide.type !== 'exploration'}
          activityInteractiveDisabled
          activityAnswer={state.activityAnswer}
        />
      );
      await nextPaint();
      await waitForImages(target, 8000);

      if (!fontEmbedReady) {
        fontEmbedReady = true;
        try {
          fontEmbedCSS = await getFontEmbedCSS(target, { fetchRequestInit });
        } catch {
          fontEmbedCSS = undefined; // fall back to per-call embedding
        }
      }

      const canvas = await toCanvas(target, {
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        pixelRatio: 1,
        fontEmbedCSS,
        backgroundColor: '#ffffff',
        fetchRequestInit,
        includeQueryParams: true,
      });
      return createImageBitmap(canvas);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        root.unmount();
      } finally {
        container.remove();
        styleKill.remove();
      }
    },
  };
}

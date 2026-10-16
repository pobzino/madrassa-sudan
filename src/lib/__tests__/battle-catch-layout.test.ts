import { describe, expect, it } from 'vitest';
import { BOSS_FOOT, OWL_FOOT, ARENAS, ARENAS_LANDSCAPE, placeInArena } from '@/components/characters';
import { BOSS_KEYS } from '@/lib/milestones/types';
import {
  BOSS_FOOT_X,
  BOSS_FOOT_Y,
  OWL_FOOT_X,
  OWL_FOOT_Y,
  MIN_BAND,
  battleGeometry,
  bubbleHeightFor,
  layoutModeFor,
} from '@/components/milestones/geometry';
import { intersects, layoutCatch, type Rect } from '@/components/milestones/moves/catchLayout';
import { splitMath } from '@/components/milestones/mathText';
import { CATCH_ITEMS } from '@/components/milestones/moves/BattleMove';

/** Every screen the battle must work on (the owner's matrix). */
const MATRIX = [
  [320, 568], [360, 640], [375, 812], [390, 844], [430, 932], [812, 375], [915, 412], [768, 1024], [820, 1180],
  [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440],
].map(([width, height]) => ({ width, height }));

function geometryFor(bossKey: (typeof BOSS_KEYS)[number], width: number, height: number, prompt = 'What is 7 + 5?', lang: 'ar' | 'en' = 'en') {
  // The battle shows the arena for its layout, as the page does.
  const orientation = layoutModeFor(width, height);
  const def = orientation === 'landscape' ? ARENAS_LANDSCAPE[bossKey] : ARENAS[bossKey];
  return battleGeometry({
    width,
    height,
    prompt,
    lang,
    anchors: {
      boss: placeInArena(def.anchors.boss, width, height, 'mid', undefined, orientation),
      owl: placeInArena(def.anchors.owl, width, height, 'floor', undefined, orientation),
    },
  });
}

/** The parts the layout check compares, in screen px. */
function partsOf(g: ReturnType<typeof battleGeometry>) {
  const s = g.moveScale;
  const band: Rect = { left: g.move.left + g.bandInset * s, top: g.move.top, right: g.move.right, bottom: g.move.top + g.bandHeight * s };
  const actions: Rect = { left: g.move.left + g.actionsInset * s, top: g.move.bottom - g.actionsHeight * s, right: g.move.right, bottom: g.move.bottom };
  const shields: Rect = { left: g.shields.x - g.shields.width / 2, top: g.shields.top, right: g.shields.x + g.shields.width / 2, bottom: g.shields.top + g.shields.height };
  return { hud: g.hud, bubble: g.bubble.rect, boss: g.bossArt, owl: g.owlArt, band, actions, shields };
}
const MUST_NOT_OVERLAP = [['bubble', 'band'], ['bubble', 'boss'], ['band', 'owl'], ['band', 'boss'], ['band', 'actions'], ['hud', 'bubble'], ['hud', 'band'], ['shields', 'band'], ['shields', 'actions']] as const;

describe('battle geometry', () => {
  it('uses the same foot points as the characters', () => {
    expect([BOSS_FOOT_X, BOSS_FOOT_Y, OWL_FOOT_X, OWL_FOOT_Y]).toEqual([BOSS_FOOT.x, BOSS_FOOT.y, OWL_FOOT.x, OWL_FOOT.y]);
  });

  it('uses the landscape layout for anything wider than tall-ish', () => {
    expect(layoutModeFor(375, 812)).toBe('portrait');
    expect(layoutModeFor(768, 1024)).toBe('portrait');
    expect(layoutModeFor(812, 375)).toBe('landscape'); // phones on their side
    expect(layoutModeFor(1024, 768)).toBe('landscape');
    expect(layoutModeFor(1440, 900)).toBe('landscape');
  });

  const LONG_EN = 'Numbo has twelve shiny marbles and gives away five to his friend. How many marbles does Numbo have left now?';
  const LONG_AR = 'لدى نُمبو اثنتا عشرة تفاحة لامعة وأعطى خمساً منها لبُرعم. كم تفاحة بقيت مع نُمبو الآن؟ هيا نعدّ معاً!';
  const PROMPTS = [['short', 'What is 7 + 5?', 'en'], ['long', LONG_EN, 'en'], ['long-ar', LONG_AR, 'ar']] as const;

  for (const { width, height } of MATRIX) {
    for (const [label, prompt, lang] of PROMPTS) {
      it(`lays out a ${label} question at ${width}x${height} with nothing overlapping or off-screen`, () => {
        for (const bossKey of BOSS_KEYS) {
          const g = geometryFor(bossKey, width, height, prompt, lang);
          const { bubble } = g;
          // the whole question shows at a readable size, no scrolling
          expect(bubble.scroll).toBe(false);
          expect(bubble.fontSize).toBeGreaterThanOrEqual(18);
          expect(bubbleHeightFor(prompt, bubble.fontSize, bubble.rect.right - bubble.rect.left, lang, bubble.placement)).toBeLessThanOrEqual(bubble.rect.bottom - bubble.rect.top + 1);
          // the targets get a usable band (4 orbs at 48px or more)
          expect(g.bandHeight).toBeGreaterThanOrEqual(MIN_BAND);
          const parts = partsOf(g);
          for (const [name, r] of Object.entries(parts)) {
            expect(r.left, `${name} left`).toBeGreaterThanOrEqual(-1);
            expect(r.top, `${name} top`).toBeGreaterThanOrEqual(-1);
            expect(r.right, `${name} right`).toBeLessThanOrEqual(width + 1);
            expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(height + 1);
          }
          for (const [a, b] of MUST_NOT_OVERLAP) expect(intersects(parts[a], parts[b]), `${a} / ${b} (${bossKey})`).toBe(false);
        }
      });
    }
  }

  it('keeps a short prompt beside the boss on a phone', () => {
    const g = geometryFor('number_giant', 375, 812, 'What is 7 + 5?');
    expect(g.bubble.placement).toBe('beside');
    expect(g.bubble.fontSize).toBeGreaterThanOrEqual(23);
    expect(g.bandHeight).toBeGreaterThanOrEqual(150);
  });

  it('grows the cast with the screen but caps it on very big ones', () => {
    const phone = geometryFor('number_giant', 375, 812);
    const desk = geometryFor('number_giant', 1440, 900);
    const huge = geometryFor('number_giant', 2560, 1440);
    expect(desk.owlSize).toBeGreaterThan(phone.owlSize);
    // about a quarter of the stage's height each, on desktops
    for (const g of [desk, huge]) {
      const h = desk === g ? 900 : 1440;
      expect((g.owlArt.bottom - g.owlArt.top) / h).toBeGreaterThan(0.2);
      expect((g.bossArt.bottom - g.bossArt.top) / h).toBeLessThan(0.3);
    }
    expect(huge.moveScale).toBeLessThanOrEqual(1.45);
  });
});

describe('catch layout (tap_to_count)', () => {
  for (const { width, height } of MATRIX) {
    for (const bossKey of BOSS_KEYS) {
      it(`places up to 14 items fully visible, apart and clear of the cast at ${width}x${height} (${bossKey})`, () => {
        const field = geometryFor(bossKey, width, height).catchField;
        expect(field.width).toBeGreaterThan(0);
        expect(field.height).toBeGreaterThan(0);
        // A battle always throws CATCH_ITEMS; any count up to that must fit.
        for (let count = 1; count <= CATCH_ITEMS; count += 1) {
          const { size, points } = layoutCatch({ count, width: field.width, height: field.height, exclude: field.exclude, seed: `q${count}` });
          expect(points).toHaveLength(count);
          expect(size).toBeGreaterThanOrEqual(52);
          expect(size).toBeLessThanOrEqual(64);
          const boxes: Rect[] = points.map((p) => ({ left: p.x, top: p.y, right: p.x + size, bottom: p.y + size }));
          for (const [i, box] of boxes.entries()) {
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.top).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(field.width);
            expect(box.bottom).toBeLessThanOrEqual(field.height);
            for (const zone of field.exclude) expect(intersects(box, zone)).toBe(false);
            for (const other of boxes.slice(i + 1)) expect(intersects(box, other)).toBe(false);
          }
        }
      });
    }
  }

  it('keeps the biggest bubbles when the count fits, and is stable for a seed', () => {
    const a = layoutCatch({ count: 6, width: 350, height: 400, seed: 'x' });
    const b = layoutCatch({ count: 6, width: 350, height: 400, seed: 'x' });
    expect(a.size).toBe(64);
    expect(a).toEqual(b);
  });
});

describe('maths never wraps', () => {
  it('finds whole expressions, keeping their question mark', () => {
    expect(splitMath('What is 7 + 5?')).toEqual([
      { text: 'What is ', math: false },
      { text: '7 + 5?', math: true },
    ]);
    expect(splitMath('كم يساوي ٧ + ٥؟')).toEqual([
      { text: 'كم يساوي ', math: false },
      { text: '٧ + ٥؟', math: true },
    ]);
    expect(splitMath('12 ÷ 3 = 4 and 2x6')).toEqual([
      { text: '12 ÷ 3 = 4', math: true },
      { text: ' and ', math: false },
      { text: '2x6', math: true },
    ]);
  });

  it('leaves plain text and single numbers alone', () => {
    expect(splitMath('Catch 6 stars!')).toEqual([{ text: 'Catch 6 stars!', math: false }]);
  });
});

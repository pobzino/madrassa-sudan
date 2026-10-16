import { describe, expect, it } from 'vitest';
import { BOSS_FOOT, OWL_FOOT, ARENAS, ARENAS_LANDSCAPE, placeInArena } from '@/components/characters';
import { BOSS_KEYS } from '@/lib/milestones/types';
import {
  BOSS_FOOT_X,
  BOSS_FOOT_Y,
  OWL_FOOT_X,
  OWL_FOOT_Y,
  LONG_PROMPT_MIN_BAND,
  battleGeometry,
  bubbleHeightFor,
  layoutModeFor,
} from '@/components/milestones/geometry';
import { intersects, layoutCatch, type Rect } from '@/components/milestones/moves/catchLayout';
import { splitMath } from '@/components/milestones/mathText';

const PHONES = [
  { width: 375, height: 812 },
  { width: 360, height: 640 },
];
const DESKTOPS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
];

function geometryFor(bossKey: (typeof BOSS_KEYS)[number], width: number, height: number, prompt = 'What is 7 + 5?', lang: 'ar' | 'en' = 'en') {
  // The battle shows the landscape arena on desktop, as the page does.
  const orientation = layoutModeFor(width, height) === 'desktop' ? 'landscape' : 'portrait';
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

describe('battle geometry', () => {
  it('uses the same foot points as the characters', () => {
    expect([BOSS_FOOT_X, BOSS_FOOT_Y, OWL_FOOT_X, OWL_FOOT_Y]).toEqual([BOSS_FOOT.x, BOSS_FOOT.y, OWL_FOOT.x, OWL_FOOT.y]);
  });

  it('picks the desktop layout only for wide landscape screens', () => {
    expect(layoutModeFor(375, 812)).toBe('phone');
    expect(layoutModeFor(768, 1024)).toBe('phone'); // tablet portrait = phone layout, scaled up
    expect(layoutModeFor(1024, 640)).toBe('desktop');
    expect(layoutModeFor(1440, 900)).toBe('desktop');
    expect(layoutModeFor(1024, 1366)).toBe('phone');
  });

  it('keeps the desktop move band between the owl and the boss', () => {
    for (const { width, height } of DESKTOPS) {
      const g = geometryFor('number_giant', width, height);
      expect(g.mode).toBe('desktop');
      expect(g.move.left).toBeGreaterThanOrEqual(g.owl.right);
      expect(g.move.right).toBeLessThanOrEqual(g.boss.left);
      expect(g.move.top).toBeGreaterThan(g.bubble.rect.bottom);
      expect(g.bossPanel).not.toBeNull();
      expect(intersects(g.bossPanel!, g.bubble.rect)).toBe(false);
      expect(g.bossSize).toBeGreaterThan(200);
    }
  });
});

describe('catch layout (tap_to_count)', () => {
  for (const { width, height } of [...PHONES, ...DESKTOPS]) {
    for (const bossKey of BOSS_KEYS) {
      it(`places 1-20 items fully visible, apart and clear of the cast at ${width}x${height} (${bossKey})`, () => {
        const field = geometryFor(bossKey, width, height).catchField;
        expect(field.width).toBeGreaterThan(0);
        expect(field.height).toBeGreaterThan(0);
        for (let count = 1; count <= 20; count += 1) {
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

describe('the question bubble is always fully readable', () => {
  const LONG_EN = 'Numbo has twelve shiny apples and gives five of them to Sprouty. How many apples does Numbo have left now? Count them!';
  const LONG_AR = 'لدى نُمبو اثنتا عشرة تفاحة لامعة وأعطى خمساً منها لبُرعم. كم تفاحة بقيت مع نُمبو الآن؟ هيا نعدّ التفاحات معاً بهدوء!';

  it('uses 120-character test prompts', () => {
    expect(LONG_EN.length).toBeGreaterThanOrEqual(115);
    expect(LONG_AR.length).toBeGreaterThanOrEqual(110);
  });

  for (const [lang, prompt] of [['en', LONG_EN], ['ar', LONG_AR]] as const) {
    for (const { width, height } of [{ width: 360, height: 640 }, { width: 375, height: 812 }, ...DESKTOPS]) {
      it(`keeps a long ${lang} prompt fully readable at ${width}x${height}`, () => {
        const g = geometryFor('number_giant', width, height, prompt, lang);
        const { bubble } = g;
        expect(bubble.fontSize).toBeGreaterThanOrEqual(18);
        const needed = bubbleHeightFor(prompt, bubble.fontSize, bubble.rect.right - bubble.rect.left, lang, bubble.placement);
        const shown = bubble.rect.bottom - bubble.rect.top;
        // The whole question shows, no scrolling, even on the small phone.
        expect(bubble.scroll).toBe(false);
        expect(needed).toBeLessThanOrEqual(shown + 1);
        // It never covers the boss's face, and the targets still get a usable band above the owl.
        if (bubble.placement === 'beside') expect(bubble.rect.right).toBeLessThanOrEqual(g.boss.left + g.bossSize * 0.12);
        if (bubble.placement === 'wide') expect(bubble.rect.top).toBeGreaterThanOrEqual(g.boss.top + g.bossSize * 0.55 - 1);
        expect(g.bandHeight).toBeGreaterThanOrEqual(LONG_PROMPT_MIN_BAND);
        expect(g.move.top).toBeGreaterThanOrEqual(bubble.rect.bottom);
        if (g.mode === 'phone') expect(g.move.top + g.bandHeight).toBeLessThanOrEqual(g.owl.top + g.owlSize * 0.12 + 1);
      });
    }
  }

  it('keeps a short prompt beside the boss on a phone', () => {
    const g = geometryFor('number_giant', 375, 812, 'What is 7 + 5?');
    expect(g.bubble.placement).toBe('beside');
    expect(g.bubble.fontSize).toBe(25);
    expect(g.bandHeight).toBeGreaterThanOrEqual(150);
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

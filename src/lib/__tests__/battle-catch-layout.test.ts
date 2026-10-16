import { describe, expect, it } from 'vitest';
import { BOSS_FOOT, OWL_FOOT, ARENAS, placeInArena } from '@/components/characters';
import { BOSS_KEYS } from '@/lib/milestones/types';
import { BOSS_FOOT_X, BOSS_FOOT_Y, OWL_FOOT_X, OWL_FOOT_Y, battleGeometry } from '@/components/milestones/geometry';
import { intersects, layoutCatch, type Rect } from '@/components/milestones/moves/catchLayout';
import { splitMath } from '@/components/milestones/mathText';

const SCREENS = [
  { width: 375, height: 812 },
  { width: 360, height: 640 },
];

function geometryFor(bossKey: (typeof BOSS_KEYS)[number], width: number, height: number) {
  const def = ARENAS[bossKey];
  return battleGeometry(width, height, {
    boss: placeInArena(def.anchors.boss, width, height, 'mid'),
    owl: placeInArena(def.anchors.owl, width, height, 'floor'),
  });
}

describe('battle geometry', () => {
  it('uses the same foot points as the characters', () => {
    expect([BOSS_FOOT_X, BOSS_FOOT_Y, OWL_FOOT_X, OWL_FOOT_Y]).toEqual([BOSS_FOOT.x, BOSS_FOOT.y, OWL_FOOT.x, OWL_FOOT.y]);
  });
});

describe('catch layout (tap_to_count)', () => {
  for (const { width, height } of SCREENS) {
    for (const bossKey of BOSS_KEYS) {
      it(`places 1-20 items fully visible, apart and clear of the owl at ${width}x${height} (${bossKey})`, () => {
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
            // fully inside the field
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.top).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(field.width);
            expect(box.bottom).toBeLessThanOrEqual(field.height);
            // clear of the owl and its platform
            for (const zone of field.exclude) expect(intersects(box, zone)).toBe(false);
            // never touching another bubble
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

  it('keeps the field above the action row and clear of the boss, the bubble and the owl', () => {
    for (const { width, height } of SCREENS) {
      const g = geometryFor('number_giant', width, height);
      expect(g.catchField.exclude.length).toBe(3);
      expect(g.catchField.top + g.catchField.height).toBeLessThan(height - 76);
    }
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

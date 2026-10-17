import { describe, expect, it } from "vitest";
import { BOSS_LINES, BOSS_LINE_KINDS, BossLinePicker, bossLineUrl } from "@/components/milestones/bossLines";
import { BOSS_KEYS } from "@/lib/milestones/types";
import { BIG_MOVE_EVERY, isBigMovePosition } from "@/lib/milestones/rules";

describe("boss lines", () => {
  it("every boss has every kind of line, in both languages, short enough to say", () => {
    for (const boss of BOSS_KEYS) {
      for (const kind of BOSS_LINE_KINDS) {
        const lines = BOSS_LINES[boss][kind];
        expect(lines.length, `${boss}.${kind}`).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line.en.trim().length).toBeGreaterThan(0);
          expect(line.ar.trim().length).toBeGreaterThan(0);
          expect(line.en.length, line.en).toBeLessThanOrEqual(70);
        }
      }
      expect(BOSS_LINES[boss].calm.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("never says the same line twice until a kind is used up, and a resume repeats the same order", () => {
    const a = new BossLinePicker("number_giant", "battle-1");
    const b = new BossLinePicker("number_giant", "battle-1");
    const c = new BossLinePicker("number_giant", "battle-2");
    const firstRound = Array.from({ length: 6 }, () => a.next("calm", "en").text);
    expect(new Set(firstRound).size).toBe(6);
    expect(Array.from({ length: 6 }, () => b.next("calm", "en").text)).toEqual(firstRound);
    const other = Array.from({ length: 6 }, () => c.next("calm", "en").text);
    expect(new Set(other).size).toBe(6);
    expect(other).not.toEqual(firstRound);
    // The 7th wraps around.
    expect(firstRound).toContain(a.next("calm", "en").text);
  });

  it("points at the recorded file for the line it chose", () => {
    const picker = new BossLinePicker("puzzle_owlet", "seed");
    const { text, url } = picker.next("ko", "ar");
    expect(text).toBe(BOSS_LINES.puzzle_owlet.ko[0].ar);
    expect(url).toBe(bossLineUrl("puzzle_owlet", "ar", "ko", 0));
    expect(url).toBe("/audio/boss/puzzle_owlet/ar/ko-0.mp3");
  });
});

describe("the Big Move", () => {
  it("is every 4th question of a battle, never past its end", () => {
    expect(BIG_MOVE_EVERY).toBe(4);
    expect([0, 1, 2, 3, 4, 7, 11, 12].map((p) => isBigMovePosition(p, 12))).toEqual([false, false, false, true, false, true, true, false]);
    expect(isBigMovePosition(7, 8)).toBe(true);
    expect(isBigMovePosition(7, 6)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { fitLabelSize } from "@/components/milestones/moves/BattleMove";

describe("fitLabelSize", () => {
  it("leaves short labels alone and fits longer words to the container, never below the floor", () => {
    expect(fitLabelSize(["tens", "ones", "4"], 30, 15)).toBeNull();
    expect(fitLabelSize(["tens", "hundreds", "ones"], 30, 15)).toBe("max(15px, min(30px, calc((100cqw - 24px) / 4.96)))");
    expect(fitLabelSize(["thousands"], 40, 12, { pad: 0, usable: 86 })).toBe("max(12px, min(40px, calc((86cqw - 0px) / 5.58)))");
    // only the longest word counts, not the whole label
    expect(fitLabelSize(["two plus two"], 30, 15)).toBeNull();
    expect(fitLabelSize([], 30, 15)).toBeNull();
  });
});

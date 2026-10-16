import { describe, expect, it } from "vitest";
import { fitLabelSize } from "@/components/milestones/moves/BattleMove";

describe("fitLabelSize", () => {
  it("keeps short labels at the base size and fits longer words to the container, never below the floor", () => {
    expect(fitLabelSize(["tens", "ones", "4"], 30, 15)).toBe("30px");
    expect(fitLabelSize(["tens", "hundreds", "ones"], 30, 15)).toBe("max(15px, min(30px, calc((100cqw - 24px) / 4.96)))");
    expect(fitLabelSize(["thousands"], 30, 15, 16)).toBe("max(15px, min(30px, calc((100cqw - 16px) / 5.58)))");
    // only the longest word counts, not the whole label
    expect(fitLabelSize(["two plus two"], 30, 15)).toBe("30px");
    expect(fitLabelSize([], 30, 15)).toBe("30px");
  });
});

import { describe, expect, it } from "vitest";
import {
  detectPracticeVisual,
  isNumberSequenceOption,
} from "@/components/practice/PracticeVisual";

describe("Practice visual detection", () => {
  it("turns an English object-count question into countable artwork", () => {
    expect(detectPracticeVisual("If you see 4 apples, which number matches the group?")).toEqual({
      kind: "count",
      count: 4,
      object: "apple",
    });
  });

  it("detects an Arabic missing-number path", () => {
    expect(detectPracticeVisual("ما العدد الذي يأتي قبل ٩؟")).toEqual({
      kind: "number_path",
      target: 9,
      relation: "before",
    });
  });

  it("recognises written counts in both languages", () => {
    expect(detectPracticeVisual("Five stars")).toEqual({ kind: "count", count: 5, object: "star" });
    expect(detectPracticeVisual("خمس نجوم")).toEqual({ kind: "count", count: 5, object: "star" });
  });

  it("detects arithmetic in either digit system", () => {
    expect(detectPracticeVisual("ما ناتج ٦ + ٣؟")).toEqual({
      kind: "equation",
      left: 6,
      operator: "+",
      right: 3,
    });
  });

  it("recognises number-sequence answer choices", () => {
    expect(isNumberSequenceOption("0، 1، 2، 3، 4، 5")).toBe(true);
    expect(isNumberSequenceOption("Counting forward")).toBe(false);
  });
});

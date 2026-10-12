import { describe, expect, it } from "vitest";
import { resolvePracticeDisplayLanguages } from "@/lib/practice-language";

describe("resolvePracticeDisplayLanguages", () => {
  it("uses an Arabic instruction but English phonics material on an Arabic interface", () => {
    expect(resolvePracticeDisplayLanguages("en", "ar")).toEqual({
      instructionLanguage: "ar",
      answerLanguage: "en",
      narrationLanguage: "ar",
    });
  });

  it("keeps Arabic answer material in Arabic when the interface is English", () => {
    expect(resolvePracticeDisplayLanguages("ar", "en")).toEqual({
      instructionLanguage: "en",
      answerLanguage: "ar",
      narrationLanguage: "en",
    });
  });

  it("uses the interface language for a bilingual or legacy lesson", () => {
    expect(resolvePracticeDisplayLanguages("both", "ar")).toEqual({
      instructionLanguage: "ar",
      answerLanguage: "ar",
      narrationLanguage: "ar",
    });
    expect(resolvePracticeDisplayLanguages(undefined, "en")).toEqual({
      instructionLanguage: "en",
      answerLanguage: "en",
      narrationLanguage: "en",
    });
  });
});

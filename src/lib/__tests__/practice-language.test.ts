import { describe, expect, it } from "vitest";
import { resolvePracticeContentLanguage } from "@/lib/practice-language";

describe("resolvePracticeContentLanguage", () => {
  it("keeps English lesson questions and answers in English on an Arabic interface", () => {
    expect(resolvePracticeContentLanguage("en", "ar")).toBe("en");
  });

  it("keeps Arabic lesson questions and answers in Arabic on an English interface", () => {
    expect(resolvePracticeContentLanguage("ar", "en")).toBe("ar");
  });

  it("uses the interface language for a bilingual or legacy lesson", () => {
    expect(resolvePracticeContentLanguage("both", "ar")).toBe("ar");
    expect(resolvePracticeContentLanguage(undefined, "en")).toBe("en");
  });
});

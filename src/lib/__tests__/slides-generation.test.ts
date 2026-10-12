import { describe, expect, it } from "vitest";
import {
  defaultSlideLanguageModeForSubject,
  normalizeSlideLanguageModeForSubject,
} from "@/lib/slides-generation";

describe("English lesson slide language", () => {
  it("defaults English subject lessons to English slides", () => {
    expect(defaultSlideLanguageModeForSubject({ name_en: "English" })).toBe("en");
  });

  it("does not let English subject lessons be changed to an incompatible slide mode", () => {
    expect(normalizeSlideLanguageModeForSubject({ name_en: "English" }, "ar")).toBe("en");
    expect(normalizeSlideLanguageModeForSubject({ name_en: "English" }, "both")).toBe("en");
  });

  it("preserves the requested mode for other subjects", () => {
    expect(normalizeSlideLanguageModeForSubject({ name_en: "Mathematics" }, "both")).toBe("both");
  });
});

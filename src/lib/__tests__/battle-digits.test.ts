import { describe, expect, it } from "vitest";
import { localizeDigits, pickList, pickText } from "@/components/milestones/moves/contract";

describe("battle digits", () => {
  it("uses Arabic-Indic digits in Arabic so questions and answers match", () => {
    expect(localizeDigits("كم يساوي 7 + 5؟", "ar")).toBe("كم يساوي ٧ + ٥؟");
    expect(pickList({ ar: ["10", "12"], en: ["10", "12"] }, "ar")).toEqual(["١٠", "١٢"]);
    expect(pickText({ ar: "", en: "Catch 6 stars!" }, "ar")).toBe("Catch ٦ stars!");
  });

  it("leaves English and already-Arabic digits alone", () => {
    expect(localizeDigits("What is 7 + 5?", "en")).toBe("What is 7 + 5?");
    expect(localizeDigits("٧ + ٥", "ar")).toBe("٧ + ٥");
  });
});

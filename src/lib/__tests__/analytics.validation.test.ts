import { describe, expect, it } from "vitest";
import { parseAnalyticsPayload } from "@/lib/analytics.validation";

describe("parseAnalyticsPayload", () => {
  it("accepts an allowlisted anonymous event", () => {
    expect(parseAnalyticsPayload({
      eventName: "signup_click",
      locale: "ar",
      path: "/sample-lesson",
      properties: { role: "parent", source: "sample_complete" },
    })).toEqual({
      eventName: "signup_click",
      locale: "ar",
      path: "/sample-lesson",
      properties: { role: "parent", source: "sample_complete" },
    });
  });

  it("drops unknown properties and limits strings", () => {
    const payload = parseAnalyticsPayload({
      eventName: "sample_question_answered",
      path: "/",
      properties: {
        answer: "A private answer",
        correct: true,
        source: "x".repeat(100),
      },
    });

    expect(payload?.properties).toEqual({
      correct: true,
      source: "x".repeat(80),
    });
  });

  it("rejects unknown events and invalid paths", () => {
    expect(parseAnalyticsPayload({ eventName: "student_answer", path: "/" })).toBeNull();
    expect(parseAnalyticsPayload({ eventName: "page_view", path: "https://example.com" })).toBeNull();
  });
});

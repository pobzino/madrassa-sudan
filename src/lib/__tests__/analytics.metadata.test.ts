import { describe, expect, it } from "vitest";
import {
  classifyAnalyticsSection,
  extractAnalyticsAttribution,
} from "@/lib/analytics.metadata";

describe("classifyAnalyticsSection", () => {
  it("separates public, auth, and platform routes", () => {
    expect(classifyAnalyticsSection("/sample-lesson")).toBe("public");
    expect(classifyAnalyticsSection("/auth/signup")).toBe("auth");
    expect(classifyAnalyticsSection("/lessons/example")).toBe("student");
    expect(classifyAnalyticsSection("/teacher/lessons")).toBe("teacher");
    expect(classifyAnalyticsSection("/admin")).toBe("admin");
  });
});

describe("extractAnalyticsAttribution", () => {
  it("keeps campaign tags and only the external referrer domain", () => {
    expect(extractAnalyticsAttribution(
      "https://amalschool.org/?utm_source=instagram&utm_medium=social&utm_campaign=uganda",
      "https://partner.example/path?private=value",
      "amalschool.org",
    )).toEqual({
      acquisition_source: "instagram",
      referrer_domain: "partner.example",
      utm_campaign: "uganda",
      utm_medium: "social",
      utm_source: "instagram",
    });
  });

  it("labels unattributed and internal traffic as direct", () => {
    expect(extractAnalyticsAttribution(
      "https://amalschool.org/",
      "https://amalschool.org/sample-lesson",
      "amalschool.org",
    )).toEqual({ acquisition_source: "direct" });
  });
});

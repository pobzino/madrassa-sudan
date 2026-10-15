import { describe, expect, it } from "vitest";
import {
  isTrustedAnalyticsOrigin,
  parseAnalyticsPayload,
} from "@/lib/analytics.validation";

describe("isTrustedAnalyticsOrigin", () => {
  it("accepts Netlify's forwarded public host", () => {
    expect(isTrustedAnalyticsOrigin(
      "https://amalschool.org",
      "internal.netlify",
      "amalschool.org",
    )).toBe(true);
  });

  it("accepts local hosts with ports", () => {
    expect(isTrustedAnalyticsOrigin(
      "http://localhost:3219",
      "localhost:3219",
      null,
    )).toBe(true);
  });

  it("rejects cross-origin and malformed origins", () => {
    expect(isTrustedAnalyticsOrigin("https://example.com", "amalschool.org", null)).toBe(false);
    expect(isTrustedAnalyticsOrigin("not a URL", "amalschool.org", null)).toBe(false);
  });
});

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

  it("accepts content context without accepting learner identifiers", () => {
    const payload = parseAnalyticsPayload({
      eventName: "practice_pass",
      locale: "en",
      path: "/practice/example",
      properties: {
        assignment_id: "assignment-1",
        attempt_number: 2,
        lesson_id: "lesson-1",
        score_percent: 80,
        student_id: "must-not-be-stored",
      },
    });

    expect(payload?.properties).toEqual({
      assignment_id: "assignment-1",
      attempt_number: 2,
      lesson_id: "lesson-1",
      score_percent: 80,
    });
  });

  it("accepts anonymous lesson activity metadata without the learner answer", () => {
    expect(parseAnalyticsPayload({
      eventName: "lesson_activity_submit",
      path: "/lessons/lesson-1",
      properties: {
        lesson_id: "lesson-1",
        activity_type: "match_pairs",
        correct: true,
        answer: "This must never be stored",
      },
    })).toEqual({
      eventName: "lesson_activity_submit",
      locale: "en",
      path: "/lessons/lesson-1",
      properties: {
        lesson_id: "lesson-1",
        activity_type: "match_pairs",
        correct: true,
      },
    });
  });

  it("accepts aggregate completion and watch-time metrics without learner identifiers", () => {
    expect(parseAnalyticsPayload({
      eventName: "lesson_watch_session_end",
      path: "/lessons/lesson-1",
      properties: {
        lesson_id: "lesson-1",
        active_play_seconds: 143,
        video_duration_seconds: 240,
        progress_percent: 75,
        student_id: "must-not-be-stored",
      },
    })).toEqual({
      eventName: "lesson_watch_session_end",
      locale: "en",
      path: "/lessons/lesson-1",
      properties: {
        lesson_id: "lesson-1",
        active_play_seconds: 143,
        video_duration_seconds: 240,
        progress_percent: 75,
      },
    });
  });

  it("rejects unknown events and invalid paths", () => {
    expect(parseAnalyticsPayload({ eventName: "student_answer", path: "/" })).toBeNull();
    expect(parseAnalyticsPayload({ eventName: "page_view", path: "https://example.com" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { stripUrlQueries, withoutQuery } from "@/lib/analytics-privacy";

describe("analytics URLs", () => {
  it("drops the query string and hash, keeping the page", () => {
    expect(withoutQuery("https://amal.school/auth/verify-email?email=parent%40example.com&type=signup#x")).toBe(
      "https://amal.school/auth/verify-email"
    );
    expect(withoutQuery("https://amal.school/")).toBe("https://amal.school/");
  });

  it("leaves values that aren't absolute URLs alone", () => {
    expect(withoutQuery("$direct")).toBe("$direct");
    expect(withoutQuery("/auth/verify-email?email=a@b.c")).toBe("/auth/verify-email?email=a@b.c");
    expect(withoutQuery(42)).toBe(42);
    expect(withoutQuery(null)).toBe(null);
  });

  it("cleans every URL-valued property of an event (and $set), and always returns the event", () => {
    const event = {
      event: "$autocapture",
      properties: {
        $current_url: "https://amal.school/auth/verify-email?email=parent@example.com&type=signup",
        $initial_current_url: "https://amal.school/auth/verify-email?email=parent@example.com",
        $session_entry_url: "https://amal.school/?utm_source=x",
        $referrer: "https://amal.school/auth/login?email=parent@example.com",
        $pathname: "/auth/verify-email",
        referrer_domain: "whatsapp.com",
        lesson_id: "abc",
      },
      $set: { $initial_referrer: "https://example.com/p?email=parent@example.com" },
    };
    const result = stripUrlQueries(event);
    expect(result).toBe(event);
    expect(result.properties).toEqual({
      $current_url: "https://amal.school/auth/verify-email",
      $initial_current_url: "https://amal.school/auth/verify-email",
      $session_entry_url: "https://amal.school/",
      $referrer: "https://amal.school/auth/login",
      $pathname: "/auth/verify-email",
      referrer_domain: "whatsapp.com",
      lesson_id: "abc",
    });
    expect(result.$set).toEqual({ $initial_referrer: "https://example.com/p" });
    expect(JSON.stringify(result)).not.toContain("parent@example.com");
  });
});

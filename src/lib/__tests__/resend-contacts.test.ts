import { describe, expect, it } from "vitest";
import { isDeliverableAmalEmail } from "@/lib/resend-contacts";

describe("isDeliverableAmalEmail", () => {
  it("accepts real email addresses", () => {
    expect(isDeliverableAmalEmail("parent@example.com")).toBe(true);
  });

  it("rejects WhatsApp-only login identifiers", () => {
    expect(isDeliverableAmalEmail("wa-249912345678@parents.amalschool.app")).toBe(false);
  });

  it("rejects missing and malformed addresses", () => {
    expect(isDeliverableAmalEmail(null)).toBe(false);
    expect(isDeliverableAmalEmail("not-an-email")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { buildOwnerRecord, needsAccountSwitch, ownsRecord, storedDataBelongsTo } from "@/lib/offline/identity";
import { authCookieNamesToClear } from "@/lib/auth/logout";
import { isOfflineLike } from "@/lib/supabase/auth-cache";

describe("offline owner", () => {
  it("builds the owner record from a verified profile", () => {
    const now = new Date("2026-10-15T08:00:00.000Z");
    expect(buildOwnerRecord({ id: "user-a", full_name: "  Amna Ali ", role: "student" }, now)).toEqual({
      key: "owner",
      userId: "user-a",
      fullName: "Amna Ali",
      role: "student",
      savedAt: "2026-10-15T08:00:00.000Z",
    });
    expect(buildOwnerRecord({ id: "user-b" }, now)).toMatchObject({ fullName: "", role: null });
  });

  it("switches accounts only when a different user owns the downloads", () => {
    expect(needsAccountSwitch(null, "user-a")).toBe(false);
    expect(needsAccountSwitch({ userId: "user-a" }, "user-a")).toBe(false);
    expect(needsAccountSwitch({ userId: "user-a" }, "user-b")).toBe(true);
  });

  it("treats a record from another account (or with no owner) as not downloaded", () => {
    const owner = { userId: "user-a" };
    expect(ownsRecord({ ownerId: "user-a" }, owner)).toBe(true);
    expect(ownsRecord({ ownerId: "user-b" }, owner)).toBe(false);
    expect(ownsRecord({}, owner)).toBe(false);
    expect(ownsRecord({ ownerId: "user-a" }, null)).toBe(false);
    expect(ownsRecord(null, owner)).toBe(false);
  });

  it("keeps unmarked storage only when everything in it is this user's", () => {
    expect(storedDataBelongsTo("user-a", [], [])).toBe(true);
    expect(
      storedDataBelongsTo("user-a", [{ ownerId: "user-a" }], [
        { lessonId: "l", ownerId: "user-a", kind: "progress", data: {}, timestamp: "t" },
        { lessonId: "l", table: "lesson_progress", data: { student_id: "user-a" }, timestamp: "t" },
      ])
    ).toBe(true);
    expect(storedDataBelongsTo("user-a", [{}], [])).toBe(false);
    expect(storedDataBelongsTo("user-a", [{ ownerId: "user-b" }], [])).toBe(false);
    expect(
      storedDataBelongsTo("user-a", [], [{ lessonId: "l", table: "lesson_progress", data: { student_id: "user-b" }, timestamp: "t" }])
    ).toBe(false);
  });
});

describe("authCookieNamesToClear", () => {
  it("finds the session cookie, its chunks and the PKCE verifier", () => {
    const cookies =
      "theme=dark; sb-abcd1234-auth-token.0=base64-xx; sb-abcd1234-auth-token.1=yy; " +
      "sb-abcd1234-auth-token-code-verifier=zz; ph_phc_123_posthog=1; sb-abcd1234-auth-token=whole";
    expect(authCookieNamesToClear(cookies)).toEqual([
      "sb-abcd1234-auth-token.0",
      "sb-abcd1234-auth-token.1",
      "sb-abcd1234-auth-token-code-verifier",
      "sb-abcd1234-auth-token",
    ]);
  });

  it("ignores other cookies and empty strings", () => {
    expect(authCookieNamesToClear("")).toEqual([]);
    expect(authCookieNamesToClear("sb-abcd-other=1; auth-token=2; xsb-abcd-auth-token=3")).toEqual([]);
  });
});

describe("isOfflineLike", () => {
  it("recognises network failures and timeouts", () => {
    expect(isOfflineLike(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(true);
    expect(isOfflineLike(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOfflineLike(Object.assign(new Error("timeout"), { name: "TimeoutError" }))).toBe(true);
    expect(isOfflineLike({ status: 503 })).toBe(true);
  });

  it("does not mistake a missing session for a network problem", () => {
    expect(isOfflineLike(new AuthSessionMissingError())).toBe(false);
    expect(isOfflineLike({ status: 401 })).toBe(false);
    expect(isOfflineLike(undefined)).toBe(false);
  });
});

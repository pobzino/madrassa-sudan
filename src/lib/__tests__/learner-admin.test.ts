import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasServiceRoleConfig: vi.fn(() => true),
  createServiceClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  hasServiceRoleConfig: mocks.hasServiceRoleConfig,
  createServiceClient: mocks.createServiceClient,
}));

import { createOwnedLearnerAdminClient } from "@/lib/server/learner-admin";

describe("createOwnedLearnerAdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      is: mocks.is,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.is.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({ data: { id: "learner-id" }, error: null });
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });
  });

  it("checks both child and parent identity before returning service access", async () => {
    const result = await createOwnedLearnerAdminClient({
      accountId: "parent-id",
      learnerId: "learner-id",
      isSelf: false,
    });

    expect(result.error).toBeNull();
    expect(result.admin).toBeTruthy();
    expect(mocks.eq.mock.calls).toEqual([
      ["id", "learner-id"],
      ["parent_account_id", "parent-id"],
      ["role", "student"],
    ]);
    expect(mocks.is).toHaveBeenCalledWith("auth_user_id", null);
  });

  it("refuses service access when the child is no longer owned", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await createOwnedLearnerAdminClient({
      accountId: "parent-id",
      learnerId: "foreign-learner-id",
      isSelf: false,
    });

    expect(result.admin).toBeNull();
    expect(result.error).toBe("learner_not_owned");
  });

  it("does not construct a service client without service-role configuration", async () => {
    mocks.hasServiceRoleConfig.mockReturnValue(false);

    const result = await createOwnedLearnerAdminClient({
      accountId: "account-id",
      learnerId: "account-id",
      isSelf: true,
    });

    expect(result).toEqual({ admin: null, error: "service_role_unavailable" });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

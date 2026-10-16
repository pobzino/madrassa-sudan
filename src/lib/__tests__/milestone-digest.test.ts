import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ table: string; method: string; args: unknown[] }>);

/** A recording query builder: every call chains, and awaiting it yields no rows. */
function recordingClient() {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, method: string) {
        if (method === "then") return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
        return (...args: unknown[]) => {
          calls.push({ table, method, args });
          return proxy;
        };
      },
    };
    const proxy = new Proxy(chain, handler);
    return proxy;
  };
  return { from: (table: string) => builder(table) };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => recordingClient() }));

import { loadWeeklyFamilies } from "@/lib/server/email-automations";
import { previousWeek } from "@/lib/email/digest";

describe("weekly digest", () => {
  it("only counts Practice attempts, so milestone battles never appear in it", async () => {
    await loadWeeklyFamilies(previousWeek(new Date("2026-10-18T06:00:00Z")));
    const attempts = calls.filter((call) => call.table === "homework_attempts");
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.some((call) => call.method === "eq" && call.args[0] === "homework_assignments.is_practice" && call.args[1] === true)).toBe(true);
    // Milestone assignments are is_practice = false (enforced by homework_assignments_milestone_check).
  });
});

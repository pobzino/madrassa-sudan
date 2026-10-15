import { beforeEach, describe, expect, it } from "vitest";
import { markRemindersAsked, remindersAskCount, shouldAskForReminders } from "@/lib/push-client";

const DAY = 24 * 60 * 60 * 1000;

describe("when to ask for reminders", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("asks straight away the first time", () => {
    expect(shouldAskForReminders(Date.now())).toBe(true);
  });

  it("waits three days between asks", () => {
    const start = Date.UTC(2026, 9, 16);
    markRemindersAsked(start);
    expect(shouldAskForReminders(start + 2 * DAY)).toBe(false);
    expect(shouldAskForReminders(start + 3 * DAY)).toBe(true);
  });

  it("stops after four asks", () => {
    let time = Date.UTC(2026, 9, 16);
    for (let i = 0; i < 4; i++) {
      expect(shouldAskForReminders(time)).toBe(true);
      markRemindersAsked(time);
      time += 4 * DAY;
    }
    expect(remindersAskCount()).toBe(4);
    expect(shouldAskForReminders(time + 30 * DAY)).toBe(false);
  });
});

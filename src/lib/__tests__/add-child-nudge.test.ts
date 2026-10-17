import { describe, expect, it } from "vitest";
import { ADD_CHILD_NUDGE_HIDE_DAYS, shouldShowAddChildNudge } from "@/lib/learners/add-child-nudge";
import type { Learner } from "@/lib/learners/types";

const self: Learner = { id: "p1", name: "Amal", avatar: null, gradeLevel: null, isSelf: true };
const child: Learner = { id: "c1", name: "Rawan", avatar: "cat", gradeLevel: 2, isSelf: false };
const base = { loading: false, isParent: true, canManageChildren: true, canHaveChildren: true, learners: [self], hiddenUntil: null, now: 1_000 };

describe("shouldShowAddChildNudge", () => {
  it("shows for a parent who only learns on their own account", () => {
    expect(shouldShowAddChildNudge(base)).toBe(true);
  });

  it("goes away once a child exists", () => {
    expect(shouldShowAddChildNudge({ ...base, learners: [self, child] })).toBe(false);
  });

  it("never shows to students, staff, or accounts that cannot add children", () => {
    expect(shouldShowAddChildNudge({ ...base, isParent: false })).toBe(false);
    expect(shouldShowAddChildNudge({ ...base, canManageChildren: false })).toBe(false);
    expect(shouldShowAddChildNudge({ ...base, canHaveChildren: false })).toBe(false);
  });

  it("waits for the learner list and respects Hide until it lapses", () => {
    expect(shouldShowAddChildNudge({ ...base, loading: true })).toBe(false);
    expect(shouldShowAddChildNudge({ ...base, hiddenUntil: 2_000 })).toBe(false);
    expect(shouldShowAddChildNudge({ ...base, hiddenUntil: 999 })).toBe(true);
    expect(ADD_CHILD_NUDGE_HIDE_DAYS).toBe(3);
  });
});

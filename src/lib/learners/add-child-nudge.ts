import type { Learner } from "@/lib/learners/types";

/** How long "Hide" keeps the add-a-child card away. */
export const ADD_CHILD_NUDGE_HIDE_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

export function addChildNudgeKey(accountId: string) {
  return `amal-add-child-nudge-hidden-until:${accountId}`;
}

/**
 * Parents who signed up before child profiles existed learn on their own
 * account. The dashboard card asks them to add a child, until they do.
 */
export function shouldShowAddChildNudge(input: {
  loading: boolean;
  isParent: boolean;
  canManageChildren: boolean;
  canHaveChildren: boolean;
  learners: Learner[];
  hiddenUntil: number | null;
  now: number;
}): boolean {
  if (input.loading || !input.isParent || !input.canManageChildren || !input.canHaveChildren) return false;
  if (input.learners.some((learner) => !learner.isSelf)) return false;
  return !(input.hiddenUntil !== null && input.hiddenUntil > input.now);
}

export function readAddChildNudgeHiddenUntil(accountId: string): number | null {
  try {
    const raw = localStorage.getItem(addChildNudgeKey(accountId));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function hideAddChildNudge(accountId: string, now = Date.now()): number {
  const until = now + ADD_CHILD_NUDGE_HIDE_DAYS * DAY;
  try {
    localStorage.setItem(addChildNudgeKey(accountId), String(until));
  } catch {
    // Storage unavailable: the card comes back next visit, which is fine.
  }
  return until;
}

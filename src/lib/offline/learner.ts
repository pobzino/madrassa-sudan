import type { LearnersResponse } from "@/lib/learners/types";
import { ACTIVE_LEARNER_STORAGE_PREFIX } from "./cache-names";

export interface CachedLearnerSelection {
  activeLearnerId: string;
  validatedLearnerIds: string[];
}

export interface LearnerSelectionResult {
  learnerId: string;
  validatedOnline: boolean;
  learners: LearnersResponse["learners"] | null;
}

export function activeLearnerStorageKey(accountId: string): string {
  return `${ACTIVE_LEARNER_STORAGE_PREFIX}${accountId}`;
}

function readSelection(accountId: string): CachedLearnerSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(activeLearnerStorageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLearnerSelection>;
    if (typeof parsed.activeLearnerId !== "string" || !Array.isArray(parsed.validatedLearnerIds)) return null;
    return {
      activeLearnerId: parsed.activeLearnerId,
      validatedLearnerIds: parsed.validatedLearnerIds.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return null;
  }
}

function writeSelection(accountId: string, selection: CachedLearnerSelection): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(activeLearnerStorageKey(accountId), JSON.stringify(selection));
  } catch {
    // Private browsing/storage quotas must not prevent online learning.
  }
}

/**
 * Persists a learner chosen from a fresh authenticated learner response.
 * The account itself is always a valid fallback learner.
 */
export function cacheValidatedLearnerSelection(accountId: string, learnerId: string, learnerIds: string[]): boolean {
  const allowed = new Set([accountId, ...learnerIds]);
  if (!allowed.has(learnerId)) return false;
  writeSelection(accountId, { activeLearnerId: learnerId, validatedLearnerIds: [...allowed] });
  return true;
}

/** Returns the active learner offline only if this device validated it before. */
export function getCachedActiveLearnerId(accountId: string): string {
  const selection = readSelection(accountId);
  return selection?.validatedLearnerIds.includes(selection.activeLearnerId) ? selection.activeLearnerId : accountId;
}

/**
 * Validates local learner state at the start of each online authenticated
 * session. On network failure, only the last server-validated learner may be
 * used offline; stale/foreign values fail back to the account's own learner.
 */
export async function validateActiveLearner(accountId: string): Promise<LearnerSelectionResult> {
  const cached = readSelection(accountId);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { learnerId: getCachedActiveLearnerId(accountId), validatedOnline: false, learners: null };
  }

  try {
    const response = await fetch("/api/learners", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Learner list could not be validated");
    const result = (await response.json()) as LearnersResponse;
    if (result.accountId !== accountId || !Array.isArray(result.learners) || !result.learners.some((learner) => learner.id === accountId && learner.isSelf)) {
      throw new Error("Learner list did not match the signed-in account");
    }
    const ids = result.learners.map((learner) => learner.id);
    const activeLearnerId = cached && ids.includes(cached.activeLearnerId) ? cached.activeLearnerId : accountId;
    cacheValidatedLearnerSelection(accountId, activeLearnerId, ids);
    return { learnerId: activeLearnerId, validatedOnline: true, learners: result.learners };
  } catch {
    const validCached = cached && cached.validatedLearnerIds.includes(cached.activeLearnerId);
    return {
      learnerId: validCached ? cached.activeLearnerId : accountId,
      validatedOnline: false,
      learners: null,
    };
  }
}

/** Offline switching is limited to self and learners this device validated online. */
export function selectCachedLearner(accountId: string, learnerId: string): boolean {
  const existing = readSelection(accountId);
  const allowed = new Set([accountId, ...(existing?.validatedLearnerIds ?? [])]);
  if (!allowed.has(learnerId)) return false;
  writeSelection(accountId, {
    activeLearnerId: learnerId,
    validatedLearnerIds: [...allowed],
  });
  return true;
}

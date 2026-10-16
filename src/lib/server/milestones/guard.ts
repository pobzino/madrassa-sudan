import "server-only";

/**
 * Milestone assignments (is_milestone, added by 20261017120000) are played as
 * battles and edited through the teacher milestone routes, never through the
 * generic homework routes. The column is newer than database.types.ts.
 */
export function isMilestoneAssignment(row: unknown): boolean {
  return Boolean(row && typeof row === "object" && (row as { is_milestone?: unknown }).is_milestone === true);
}

export const USE_BATTLE_ERROR = { error: "use_battle" } as const;

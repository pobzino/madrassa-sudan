import type { Rect } from "./moves/catchLayout";

/**
 * The battle's layout from the screen size and the arena's anchors (feet
 * positions in px): where the boss and owl boxes go, the band for the move's
 * targets, and the field the catch move scatters into. Pure, so the catch
 * layout can be tested at real screen sizes.
 */
export const BOSS_FOOT_Y = 0.94;
export const BOSS_FOOT_X = 0.5;
export const OWL_FOOT_Y = 0.869;
export const OWL_FOOT_X = 0.5;
/** The move column: max width and side padding. */
export const COLUMN_MAX = 480;
export const COLUMN_PAD = 12;
/** The bottom action row (one big button, small icons, the "Caught N" pill). */
export const ACTION_ROW_H = 76;
/** The "Caught N" pill sits in the action row, so the field runs down to it. */
export const PILL_ROW_H = 0;
export const BOTTOM_GAP = 10;
/** The HUD (panel + shields row) ends about here, below the safe area. */
export const HUD_BOTTOM = 132;
/** The speech bubble: two lines of prompt with the speaker beside them. */
export const BUBBLE_EST_H = 104;

export interface BattleGeometry {
  bossSize: number;
  owlSize: number;
  boss: Rect;
  owl: Rect;
  /** Top of the move area (just under the boss's ledge), screen px. */
  bandTop: number;
  /** Height of the targets band (down to the owl's head). */
  bandHeight: number;
  /** The move column, screen px. */
  column: { left: number; right: number };
  /** The speech bubble beside the boss (its height is an estimate: two lines). */
  bubble: Rect;
  /**
   * The catch field, in its own coordinates (0,0 = its top-left): from under
   * the HUD down to the action row, both sides, with the boss and its ledge,
   * the bubble and the owl (and its platform) to avoid.
   */
  catchField: { top: number; width: number; height: number; exclude: Rect[] };
}

export function battleGeometry(
  width: number,
  height: number,
  anchors: { boss: { x: number; y: number; scale: number }; owl: { x: number; y: number } },
  safeBottom = 0
): BattleGeometry {
  const bossSize = Math.round(Math.min(230, Math.max(150, 180 * anchors.boss.scale)));
  const owlSize = Math.round(bossSize * 0.853);
  const bossLeft = anchors.boss.x - bossSize * BOSS_FOOT_X;
  const bossTop = anchors.boss.y - bossSize * BOSS_FOOT_Y;
  const owlLeft = anchors.owl.x - owlSize * OWL_FOOT_X;
  const owlTop = anchors.owl.y - owlSize * OWL_FOOT_Y;
  const bandTop = anchors.boss.y + 10;
  const bandHeight = Math.round(Math.max(170, Math.min(240, owlTop + owlSize * 0.12 - bandTop - 8)));

  const columnWidth = Math.min(width, COLUMN_MAX);
  const columnLeft = (width - columnWidth) / 2 + COLUMN_PAD;
  const columnRight = (width + columnWidth) / 2 - COLUMN_PAD;
  const fieldTop = HUD_BOTTOM;
  const fieldBottom = height - safeBottom - BOTTOM_GAP - ACTION_ROW_H - PILL_ROW_H;
  const field = { top: fieldTop, width: columnRight - columnLeft, height: Math.max(0, fieldBottom - fieldTop) };
  const bubbleTop = Math.max(bossTop + bossSize * 0.14, HUD_BOTTOM + 8);
  const bubble: Rect = { left: 12, top: bubbleTop, right: Math.max(162, bossLeft + bossSize * 0.12 - 12), bottom: bubbleTop + BUBBLE_EST_H };
  const margin = 6;
  const toField = (r: Rect): Rect => ({
    left: r.left - columnLeft - margin,
    top: r.top - fieldTop - margin,
    right: r.right - columnLeft + margin,
    bottom: r.bottom - fieldTop + margin,
  });
  // The boss down to its ledge, the bubble, and the owl with everything under it.
  const bossZone = toField({ left: bossLeft, top: bossTop, right: bossLeft + bossSize, bottom: bandTop });
  const bubbleZone = toField(bubble);
  const owlZone = { ...toField({ left: owlLeft, top: owlTop + owlSize * 0.08, right: owlLeft + owlSize, bottom: fieldBottom }), bottom: field.height + 1 };

  return {
    bossSize,
    owlSize,
    boss: { left: bossLeft, top: bossTop, right: bossLeft + bossSize, bottom: bossTop + bossSize },
    owl: { left: owlLeft, top: owlTop, right: owlLeft + owlSize, bottom: owlTop + owlSize },
    bandTop,
    bandHeight,
    column: { left: columnLeft, right: columnRight },
    bubble,
    catchField: { ...field, exclude: [bossZone, bubbleZone, owlZone] },
  };
}

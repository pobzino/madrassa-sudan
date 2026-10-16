import type { Rect } from "./moves/catchLayout";

/**
 * The battle's layout, pure so it can be tested at real screen sizes.
 *
 *  - phone (and tablet portrait): the cast stands on the portrait arena's
 *    anchors; the boss's health is in a top panel; the question bubble sits
 *    beside the boss (or, if it won't fit there, full width under the ledge);
 *    the move's targets fill the band between the ledge and the owl.
 *  - desktop (landscape, 1024px and wider): the owl in the left third, the
 *    boss in the right third, the boss's health over the boss, a big question
 *    bubble centred at the top, the targets in the wide central band and one
 *    action button bottom-centre.
 *
 * The owl's shields (its "life") always sit in a small row under its feet.
 */
export const BOSS_FOOT_Y = 0.94;
export const BOSS_FOOT_X = 0.5;
export const OWL_FOOT_Y = 0.869;
export const OWL_FOOT_X = 0.5;
/** The move column: max width and side padding (phone). */
export const COLUMN_MAX = 480;
export const COLUMN_PAD = 12;
/** The bottom action row (one big button, small icons, the "Caught N" pill). */
export const ACTION_ROW_H = 76;
/** Kept for callers: the "Caught N" pill sits in the action row. */
export const PILL_ROW_H = 0;
export const BOTTOM_GAP = 10;
/** The phone HUD (close button + boss panel, one row) ends about here. */
export const HUD_BOTTOM = 84;
/** The shields-and-combo row under the owl. */
export const SHIELD_ROW_H = 34;
/** The targets' band (phone): its usual minimum, and how far a long question may squeeze it. */
export const MIN_BAND = 150;
export const LONG_PROMPT_MIN_BAND = 120;
/** Desktop scales the move (targets and type) up by this much. */
export const DESKTOP_MOVE_SCALE = 1.2;

export type BattleLayoutMode = "phone" | "desktop";

/** Desktop is a real landscape layout; narrower or portrait screens use the phone layout. */
export function layoutModeFor(width: number, height: number): BattleLayoutMode {
  return width >= 1024 && width > height ? "desktop" : "phone";
}

/** The cast's size on the landscape arenas, in arena units (scaled by the anchors). */
export const DESKTOP_BOSS_UNITS = 278;
export const DESKTOP_OWL_UNITS = 232;

/* ------------------------------------------------------------ the bubble */

export interface BubbleFit {
  /** Font size of the question, px. */
  fontSize: number;
  /** Estimated height of the bubble, px (padding included). */
  height: number;
  /** Beside the boss, or full width under the ledge (phone, long prompts). */
  placement: "beside" | "wide" | "top";
  /** The text can't fit even at the smallest size: the bubble scrolls. */
  scroll: boolean;
  /** The bubble's box (height = the estimate, never more than allowed). */
  rect: Rect;
  /** Desktop: where the tail leaves the bubble's bottom (px from its left) and its tilt toward the boss (deg, + = right). */
  tail?: { x: number; angle: number };
}

/** Rough glyph width per font size for the battle's rounded fonts (bold). */
const CHAR_EM = { en: 0.56, ar: 0.5 } as const;
const LINE_HEIGHT = 1.2;
const BUBBLE_PAD_Y = 24;
const BUBBLE_PAD_X = 30;
/** The replay-audio button beside the text. */
const SPEAKER_W = 56;

/**
 * Lines a text needs at a font size and width (words never split). With a
 * float (the replay button tucked into the bubble's top corner), the first
 * lines are that much narrower.
 */
export function estimateLines(text: string, fontSize: number, width: number, lang: "ar" | "en", float?: { width: number; height: number }): number {
  const perChar = fontSize * CHAR_EM[lang];
  const floatLines = float ? Math.ceil(float.height / (fontSize * LINE_HEIGHT)) : 0;
  const maxCharsOn = (line: number) => Math.max(1, Math.floor((line <= floatLines && float ? width - float.width : width) / perChar));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (used === 0) used = len;
    else if (used + 1 + len <= maxCharsOn(lines)) used += 1 + len;
    else {
      lines += 1;
      used = len;
    }
    while (used > maxCharsOn(lines)) {
      used -= maxCharsOn(lines);
      lines += 1;
    }
  }
  return lines;
}

/** The replay button, floated into the top corner of a full-width bubble. */
export const SPEAKER_FLOAT = { width: 54, height: 46 };

/** The height a bubble needs for its text, padding included. */
export function bubbleHeightFor(text: string, fontSize: number, bubbleWidth: number, lang: "ar" | "en", placement: BubbleFit["placement"]): number {
  const lines =
    placement === "wide"
      ? estimateLines(text, fontSize, bubbleWidth - BUBBLE_PAD_X, lang, SPEAKER_FLOAT)
      : estimateLines(text, fontSize, bubbleWidth - BUBBLE_PAD_X - SPEAKER_W, lang);
  return Math.ceil(Math.max(lines * fontSize * LINE_HEIGHT, placement === "wide" ? SPEAKER_FLOAT.height : 0) + BUBBLE_PAD_Y);
}

function fitIn(text: string, lang: "ar" | "en", box: { width: number; maxHeight: number }, sizes: number[]) {
  for (const fontSize of sizes) {
    const lines = estimateLines(text, fontSize, box.width - BUBBLE_PAD_X - SPEAKER_W, lang);
    const height = Math.ceil(lines * fontSize * LINE_HEIGHT + BUBBLE_PAD_Y);
    if (height <= box.maxHeight) return { fontSize, height, fits: true };
  }
  const fontSize = sizes[sizes.length - 1];
  const lines = estimateLines(text, fontSize, box.width - BUBBLE_PAD_X - SPEAKER_W, lang);
  return { fontSize, height: Math.ceil(lines * fontSize * LINE_HEIGHT + BUBBLE_PAD_Y), fits: false };
}

/* --------------------------------------------------------------- geometry */

export interface BattleGeometry {
  mode: BattleLayoutMode;
  bossSize: number;
  owlSize: number;
  boss: Rect;
  owl: Rect;
  /** Where the boss's name + health panel goes (desktop: over the boss). Null on phone (top HUD). */
  bossPanel: Rect | null;
  /** The shields row under the owl: its centre x and top y. */
  shields: { x: number; top: number };
  bubble: BubbleFit;
  /** The move area (targets + action row), screen px. */
  move: Rect;
  /** Height of the targets band, in the move's own (unscaled) px. */
  bandHeight: number;
  /** The move's scale (desktop is bigger). */
  moveScale: number;
  /**
   * The catch field, in its own coordinates (0,0 = its top-left, unscaled
   * px): from under the HUD (phone) or the bubble (desktop) down to the
   * action row, with the boss, the bubble and the owl to avoid.
   */
  catchField: { top: number; width: number; height: number; exclude: Rect[] };
}

export interface GeometryInput {
  width: number;
  height: number;
  /** Feet anchors in px (from the arena; `scale` = px per arena unit). */
  anchors: { boss: { x: number; y: number; scale: number }; owl: { x: number; y: number; scale: number } };
  /** The question, to size the bubble. */
  prompt?: string;
  lang?: "ar" | "en";
  safeTop?: number;
  safeBottom?: number;
  mode?: BattleLayoutMode;
}

export function battleGeometry(input: GeometryInput): BattleGeometry {
  const mode = input.mode ?? layoutModeFor(input.width, input.height);
  return mode === "desktop" ? desktopGeometry(input) : phoneGeometry(input);
}

function phoneGeometry({ width, height, anchors, prompt = "", lang = "en", safeTop = 0, safeBottom = 0 }: GeometryInput): BattleGeometry {
  const bossSize = Math.round(Math.min(230, Math.max(150, 180 * anchors.boss.scale)));
  const owlSize = Math.round(bossSize * 0.853);
  const bossLeft = anchors.boss.x - bossSize * BOSS_FOOT_X;
  const bossTop = anchors.boss.y - bossSize * BOSS_FOOT_Y;
  const owlLeft = anchors.owl.x - owlSize * OWL_FOOT_X;
  const owlTop = anchors.owl.y - owlSize * OWL_FOOT_Y;
  const hudBottom = safeTop + HUD_BOTTOM;
  const ledge = anchors.boss.y + 10;
  // The targets' band ends just above the owl's head.
  const bandBottom = owlTop + owlSize * 0.12 - 8;

  const columnWidth = Math.min(width, COLUMN_MAX);
  const columnLeft = (width - columnWidth) / 2 + COLUMN_PAD;
  const columnRight = (width + columnWidth) / 2 - COLUMN_PAD;
  const moveBottom = height - safeBottom - BOTTOM_GAP;
  const fieldBottom = moveBottom - ACTION_ROW_H - PILL_ROW_H;

  // The bubble: beside the boss if the question fits there (it may grow up
  // to the HUD), else full width under the boss (tucking up over its ledge,
  // never its face, as far as it needs), with the font stepping down and the
  // targets' band giving a little. Only if all that fails does it scroll,
  // always showing at least three lines.
  const besideTop = Math.max(bossTop + bossSize * 0.14, hudBottom + 8);
  const beside = { left: 12, right: Math.max(162, bossLeft + bossSize * 0.12 - 12) };
  const besideSizes = [25, 23, 21, 20];
  const besideFit = fitIn(prompt, lang, { width: beside.right - beside.left, maxHeight: ledge - 6 - besideTop }, besideSizes);
  const tallTop = hudBottom + 8;
  const tallFit = besideFit.fits ? besideFit : fitIn(prompt, lang, { width: beside.right - beside.left, maxHeight: ledge - 6 - tallTop }, besideSizes);
  let bubble: BubbleFit;
  let bandTop = ledge;
  if (besideFit.fits || tallFit.fits) {
    const fit = besideFit.fits ? besideFit : tallFit;
    const top = besideFit.fits ? besideTop : tallTop;
    bubble = { fontSize: fit.fontSize, height: fit.height, placement: "beside", scroll: false, rect: { ...beside, top, bottom: top + fit.height } };
  } else {
    const wide = { left: columnLeft, right: columnRight };
    const wideW = wide.right - wide.left;
    const sizes = [24, 22, 20, 18];
    const highest = Math.max(hudBottom + 8, bossTop + bossSize * 0.55);
    let placed: { fontSize: number; height: number; top: number } | null = null;
    for (const minBand of [MIN_BAND, 136, LONG_PROMPT_MIN_BAND]) {
      const room = bandBottom - minBand - 10 - highest;
      const fontSize = sizes.find((size) => bubbleHeightFor(prompt, size, wideW, lang, "wide") <= room);
      if (fontSize === undefined) continue;
      const h = bubbleHeightFor(prompt, fontSize, wideW, lang, "wide");
      placed = { fontSize, height: h, top: Math.min(ledge, bandBottom - minBand - 10 - h) };
      break;
    }
    if (placed) {
      bubble = { fontSize: placed.fontSize, height: placed.height, placement: "wide", scroll: false, rect: { ...wide, top: placed.top, bottom: placed.top + placed.height } };
    } else {
      const fontSize = sizes[sizes.length - 1];
      const minVisible = Math.ceil(3 * fontSize * LINE_HEIGHT + BUBBLE_PAD_Y);
      const h = Math.max(minVisible, bandBottom - LONG_PROMPT_MIN_BAND - 10 - highest);
      bubble = { fontSize, height: h, placement: "wide", scroll: true, rect: { ...wide, top: highest, bottom: highest + h } };
    }
    bandTop = bubble.rect.bottom + 10;
  }
  const bandHeight = Math.round(Math.max(LONG_PROMPT_MIN_BAND, Math.min(240, bandBottom - bandTop)));

  const fieldTop = hudBottom;
  const field = { top: fieldTop, width: columnRight - columnLeft, height: Math.max(0, fieldBottom - fieldTop) };
  const margin = 6;
  const toField = (r: Rect): Rect => ({ left: r.left - columnLeft - margin, top: r.top - fieldTop - margin, right: r.right - columnLeft + margin, bottom: r.bottom - fieldTop + margin });
  const bossZone = toField({ left: bossLeft, top: bossTop, right: bossLeft + bossSize, bottom: ledge });
  const bubbleZone = toField(bubble.rect);
  const owlZone = { ...toField({ left: owlLeft, top: owlTop + owlSize * 0.08, right: owlLeft + owlSize, bottom: fieldBottom }), bottom: field.height + 1 };

  return {
    mode: "phone",
    bossSize,
    owlSize,
    boss: { left: bossLeft, top: bossTop, right: bossLeft + bossSize, bottom: bossTop + bossSize },
    owl: { left: owlLeft, top: owlTop, right: owlLeft + owlSize, bottom: owlTop + owlSize },
    bossPanel: null,
    // On the front of the owl's platform, just below its top edge (under the feet, not over the owl).
    shields: { x: anchors.owl.x, top: anchors.owl.y + 6 },
    bubble,
    move: { left: columnLeft, right: columnRight, top: bandTop, bottom: moveBottom },
    bandHeight,
    moveScale: 1,
    catchField: { ...field, exclude: [bossZone, bubbleZone, owlZone] },
  };
}

function desktopGeometry({ width, height, anchors, prompt = "", lang = "en", safeTop = 0, safeBottom = 0 }: GeometryInput): BattleGeometry {
  const pad = 24;
  // Anchors come from the landscape arena: owl in the left third, boss on its ledge in the right third.
  const bossSize = Math.round(DESKTOP_BOSS_UNITS * anchors.boss.scale);
  const owlSize = Math.round(DESKTOP_OWL_UNITS * anchors.owl.scale);
  const { boss, owl } = anchors;
  const bossLeft = boss.x - bossSize * BOSS_FOOT_X;
  const bossTop = boss.y - bossSize * BOSS_FOOT_Y;
  const owlLeft = owl.x - owlSize * OWL_FOOT_X;
  const owlTop = owl.y - owlSize * OWL_FOOT_Y;
  const scale = DESKTOP_MOVE_SCALE;

  // The question, big and centred at the top between them.
  const bubbleW = Math.min(720, width * 0.46);
  const bubbleTop = safeTop + pad;
  const bubbleMax = Math.round(height * 0.3);
  const fit = fitIn(prompt, lang, { width: bubbleW, maxHeight: bubbleMax }, [38, 34, 30, 27, 24]);
  const bubbleH = Math.min(fit.height, bubbleMax);
  const bubble: BubbleFit = {
    fontSize: fit.fontSize,
    height: bubbleH,
    placement: "top",
    scroll: !fit.fits,
    rect: { left: (width - bubbleW) / 2, right: (width + bubbleW) / 2, top: bubbleTop, bottom: bubbleTop + bubbleH },
  };
  // The tail points at the boss.
  const tailX = Math.max(40, Math.min(bubbleW - 40, boss.x - bubble.rect.left));
  const tailAngle = (Math.atan2(boss.x - (bubble.rect.left + tailX), Math.max(40, bossTop + bossSize * 0.2 - bubble.rect.bottom)) * 180) / Math.PI;
  bubble.tail = { x: tailX, angle: Math.round(Math.max(-65, Math.min(65, tailAngle))) };

  // The boss's name and health, over the boss (and clear of the bubble).
  const panelW = Math.min(380, bossSize * 1.25);
  const panelLeft = Math.min(width - pad - panelW, boss.x - panelW / 2);
  const overlapsBubble = panelLeft < bubble.rect.right;
  const panelTop = Math.max(safeTop + pad, bossTop - 86, overlapsBubble ? bubble.rect.bottom + 12 : 0);
  const bossPanel = { left: panelLeft, right: panelLeft + panelW, top: panelTop, bottom: panelTop + 70 };

  // The move: the wide central band between the owl and the boss.
  const moveLeft = Math.max(owlLeft + owlSize + 8, width * 0.29);
  // Clear of the boss and of its health panel above it.
  const moveRight = Math.min(bossLeft - 8, bossPanel.left - 16, width * 0.71);
  const moveTop = bubble.rect.bottom + 18;
  const moveBottom = height - safeBottom - pad;
  const unscaledH = (moveBottom - moveTop) / scale;
  const bandHeight = Math.round(Math.max(170, Math.min(360, unscaledH - ACTION_ROW_H - 12)));
  const field = { top: moveTop, width: (moveRight - moveLeft) / scale, height: Math.max(0, unscaledH - ACTION_ROW_H) };

  return {
    mode: "desktop",
    bossSize,
    owlSize,
    boss: { left: bossLeft, top: bossTop, right: bossLeft + bossSize, bottom: bossTop + bossSize },
    owl: { left: owlLeft, top: owlTop, right: owlLeft + owlSize, bottom: owlTop + owlSize },
    bossPanel,
    shields: { x: owl.x, top: owl.y + 2 },
    bubble,
    move: { left: moveLeft, right: moveRight, top: moveTop, bottom: moveBottom },
    bandHeight,
    moveScale: scale,
    // The band lies between the two, so nothing in it needs avoiding.
    catchField: { ...field, exclude: [] },
  };
}

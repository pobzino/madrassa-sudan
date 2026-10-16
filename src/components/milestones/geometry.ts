import type { Rect } from "./moves/catchLayout";

/**
 * The battle's layout, pure so it can be tested at every screen size.
 *
 * Two arrangements, both fluid (sizes come from the stage, with clamps so
 * nothing gets tiny on a small phone or giant on a 2560px screen):
 *
 *  - portrait (phones, portrait tablets): the portrait arena. The boss's
 *    health is in a top panel; the question bubble sits beside the boss, or
 *    full width under its ledge; the targets fill the band between the ledge
 *    and the owl's head, or, when a long question leaves no room there, the
 *    space beside the owl. One action row along the bottom.
 *  - landscape (phones on their side, landscape tablets, desktops): the
 *    landscape arena. Owl on the left, boss on the right, the boss's health
 *    top-right above it, the bubble across the top, the targets and the
 *    action row in the middle between the two.
 *
 * The owl's shields (its "life") always sit in a small row under its feet.
 * Nothing may overlap: the targets keep clear of the characters' visible art
 * (not just their boxes), the bubble, the HUD and the shields.
 */
export const BOSS_FOOT_Y = 0.94;
export const BOSS_FOOT_X = 0.5;
export const OWL_FOOT_Y = 0.869;
export const OWL_FOOT_X = 0.5;

/** Where the art actually is inside each character's square box (fractions; measured). */
export const BOSS_ART = { left: 0.06, top: 0.14, right: 0.94, bottom: 0.99 } as const;
export const OWL_ART = { left: 0.1, top: 0.13, right: 0.9, bottom: 0.97 } as const;

export const COLUMN_PAD = 12;
/** Smallest band of targets: 4 orbs at 48px+ need this much (unscaled px). */
export const MIN_BAND = 112;
/** Kept for the tests' name: a long question may squeeze the band down to the minimum. */
export const LONG_PROMPT_MIN_BAND = MIN_BAND;

export type BattleLayoutMode = "portrait" | "landscape";

/** Landscape for anything wider than it is tall-ish (phones on their side, tablets, desktops). */
export function layoutModeFor(width: number, height: number): BattleLayoutMode {
  return width / Math.max(1, height) >= 0.9 ? "landscape" : "portrait";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------ the bubble */

export interface BubbleFit {
  /** Font size of the question, px. */
  fontSize: number;
  /** Estimated height of the bubble, px (padding included). */
  height: number;
  /** Beside the boss, full width under its ledge, or across the top (landscape). */
  placement: "beside" | "wide" | "top";
  /** The text can't fit even at the smallest size: the bubble scrolls (last resort). */
  scroll: boolean;
  rect: Rect;
  /** Landscape: where the tail leaves the bubble's bottom (px from its left) and its tilt toward the boss (deg). */
  tail?: { x: number; angle: number };
}

/** Rough glyph width per font size for the battle's rounded fonts (bold). */
const CHAR_EM = { en: 0.56, ar: 0.56 } as const;
const LINE_HEIGHT = 1.2;
const BUBBLE_PAD_Y = 24;
const BUBBLE_PAD_X = 30;
/** The replay-audio button beside the text. */
const SPEAKER_W = 56;
/** The smallest question text anywhere. */
export const MIN_BUBBLE_FONT = 18;

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
  // Maths never wraps ("7 + 5?" is one unbreakable run), so count it as one word.
  const words = text.replace(/\s*([+\-−×÷=<>])\s*/g, " $1 ").split(/[ \t\r\n]+/).filter(Boolean);
  for (const word of words) {
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
  // Arabic glyphs stand taller than their line: a little room under the last line.
  const tall = lang === "ar" ? fontSize * 0.35 : 0;
  return Math.ceil(Math.max(lines * fontSize * LINE_HEIGHT + tall, placement === "wide" ? SPEAKER_FLOAT.height : 44) + BUBBLE_PAD_Y);
}

/** The largest of `sizes` at which the text fits `maxHeight`, or null. */
function fitFont(text: string, lang: "ar" | "en", width: number, maxHeight: number, sizes: number[], placement: BubbleFit["placement"]) {
  for (const fontSize of sizes) {
    const height = bubbleHeightFor(text, fontSize, width, lang, placement);
    if (height <= maxHeight) return { fontSize, height };
  }
  return null;
}

/** Font sizes to try, largest first, stepping down to the smallest allowed. */
const steps = (from: number, scale: number) => {
  const top = Math.max(MIN_BUBBLE_FONT, Math.round(from * scale));
  const out: number[] = [];
  for (let size = top; size > MIN_BUBBLE_FONT; size -= Math.max(1, Math.round(top * 0.08))) out.push(size);
  out.push(MIN_BUBBLE_FONT);
  return out;
};

/* --------------------------------------------------------------- geometry */

export interface BattleGeometry {
  mode: BattleLayoutMode;
  /** The UI's scale on this screen (type, HUD, icons): about 0.85 on a small phone, up to 1.5. */
  ui: number;
  bossSize: number;
  owlSize: number;
  /** The characters' square boxes. */
  boss: Rect;
  owl: Rect;
  /** Where their art actually is (what nothing may cover). */
  bossArt: Rect;
  owlArt: Rect;
  /** The close button and the HUD panel with the boss's name and health. */
  close: Rect;
  hud: Rect;
  /** The shields row under the owl: its centre x, top y and height. */
  shields: { x: number; top: number; height: number; width: number; icon: number };
  bubble: BubbleFit;
  /** The move area (targets + action row), screen px. */
  move: Rect;
  /** Height of the targets band, in the move's own (unscaled) px. */
  bandHeight: number;
  /** The band's left inset inside the move area (unscaled px): it sits beside the owl on a crowded phone. */
  bandInset: number;
  /** The bottom action row's height (unscaled px). */
  actionsHeight: number;
  /** The action row's left inset (unscaled px): past the owl's shields on a tall tablet. */
  actionsInset: number;
  /** The move's scale (bigger on tablets and desktops). */
  moveScale: number;
  /**
   * The catch field, in its own coordinates (0,0 = its top-left, unscaled
   * px), with the boss, the bubble, the owl and its shields to avoid.
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
  return mode === "landscape" ? landscapeGeometry(input) : portraitGeometry(input);
}

const box = (cx: number, footY: number, size: number, footX: number, footYf: number): Rect => {
  const left = cx - size * footX;
  const top = footY - size * footYf;
  return { left, top, right: left + size, bottom: top + size };
};
const art = (r: Rect, f: { left: number; top: number; right: number; bottom: number }): Rect => {
  const s = r.right - r.left;
  return { left: r.left + s * f.left, top: r.top + s * f.top, right: r.left + s * f.right, bottom: r.top + s * f.bottom };
};

/** The shields (and Super Star pips) row: its size on this screen. */
function shieldsRow(ui: number, compact: boolean) {
  const icon = Math.round((compact ? 20 : 24) * Math.max(1, ui));
  const height = icon + 10;
  // 3 shields + padding, a gap, the 3-pip combo pill
  const width = Math.round(3 * icon + 2 * 4 + 16 + 6 + (3 * (icon - 4) + 2 * 2 + 16));
  return { icon, height, width };
}

function portraitGeometry({ width, height, anchors, prompt = "", lang = "en", safeTop = 0, safeBottom = 0 }: GeometryInput): BattleGeometry {
  const ui = clamp(width / 390, 0.86, 1.45);
  const short = height < 700;
  const tiny = height < 600;
  const moveScale = clamp(ui, 1, 1.45);

  // HUD: the close button and the boss's panel in one row along the top.
  const hudH = Math.round(58 * clamp(ui, 1, 1.3));
  const hudTop = safeTop + 12;
  const hudBottom = hudTop + hudH;
  const close: Rect = { left: COLUMN_PAD, top: hudTop, right: COLUMN_PAD + hudH, bottom: hudBottom };

  // The bottom action row and the gap under it.
  const actionsHeight = tiny ? 56 : short ? 62 : 76;
  const bottomGap = tiny ? 6 : 10;
  const moveBottom = height - safeBottom - bottomGap;
  const actionsTop = moveBottom - actionsHeight * moveScale;

  // The boss on its ledge: as big as fits under the HUD.
  const bossFoot = anchors.boss.y;
  const fitUnderHud = (bossFoot - hudBottom - 6) / (BOSS_FOOT_Y - BOSS_ART.top);
  const bossSize = Math.round(clamp(Math.min(width * 0.48, height * 0.3, fitUnderHud), 110, 330));
  // (nudged in from the edge so the hit recoil never clips)
  const boss = box(anchors.boss.x - Math.max(10, Math.round(bossSize * 0.12)), bossFoot, bossSize, BOSS_FOOT_X, BOSS_FOOT_Y);
  const bossArt = art(boss, BOSS_ART);

  // The owl, with its shields under its feet and the action row under them.
  const row = shieldsRow(ui, short);
  let owlSize = Math.round(bossSize * 0.853);
  const owlFoot = anchors.owl.y;
  const owl = box(anchors.owl.x, owlFoot, owlSize, OWL_FOOT_X, OWL_FOOT_Y);
  const owlArt = art(owl, OWL_ART);
  owlSize = owl.right - owl.left;
  const shieldsX = clamp(anchors.owl.x, row.width / 2 + 6, width - row.width / 2 - 6);
  // Shields just under the feet. If the action row is in the way and there's
  // room beside them (tablets), the row moves over; else the shields sit just
  // above the row.
  const underFeet = Math.round(Math.min(owlFoot + 2, moveBottom - row.height));
  const rowInset = (Math.max(shieldsX + row.width / 2, owlArt.right) + 12 - COLUMN_PAD) / moveScale;
  const roomBeside = (width - 2 * COLUMN_PAD) / moveScale - rowInset;
  // (also when the row would cover the owl itself, as on a tall tablet)
  const crowded = underFeet + row.height > actionsTop - 2 || actionsTop < owlArt.bottom - 12;
  const actionsInset = crowded && roomBeside >= 280 ? Math.round(rowInset) : 0;
  const shieldsTop = actionsInset ? underFeet : Math.round(Math.min(owlFoot + 2, actionsTop - row.height - 3));
  const shields = { x: shieldsX, top: shieldsTop, height: row.height, width: row.width, icon: row.icon };

  // The column the targets use.
  const columnLeft = COLUMN_PAD;
  const columnRight = width - COLUMN_PAD;
  const ledge = Math.max(bossArt.bottom, bossFoot) + 4;
  const bandBottom = owlArt.top - 6;

  // The bubble: beside the boss if it fits there (growing up to the HUD), else
  // full width under the ledge.
  const beside = { left: COLUMN_PAD, right: Math.max(150, bossArt.left - 12) };
  const besideTop = Math.max(boss.top + bossSize * 0.18, hudBottom + 10);
  const besideSizes = steps(25, clamp(ui, 1, 1.3));
  const fitBeside =
    fitFont(prompt, lang, beside.right - beside.left, ledge - 6 - besideTop, besideSizes, "beside") ??
    fitFont(prompt, lang, beside.right - beside.left, ledge - 6 - (hudBottom + 10), besideSizes, "beside");
  let bubble: BubbleFit;
  let bandTop: number;
  let bandInset = 0;
  let bandH: number;
  // Beside the owl: from the bubble down to the shields, right of the owl's art.
  const sideBottom = shieldsTop - 6;
  const sideInset = Math.max(0, owlArt.right + 10 - columnLeft) / moveScale;
  if (fitBeside) {
    const top = Math.max(hudBottom + 10, Math.min(besideTop, ledge - 6 - fitBeside.height));
    bubble = { fontSize: fitBeside.fontSize, height: fitBeside.height, placement: "beside", scroll: false, rect: { ...beside, top, bottom: top + fitBeside.height } };
    bandTop = ledge;
    bandH = (bandBottom - bandTop) / moveScale;
    if (bandH < MIN_BAND) {
      bandInset = sideInset;
      bandH = (sideBottom - bandTop) / moveScale;
    }
  } else {
    const wide = { left: columnLeft, right: columnRight };
    const wideSizes = steps(24, clamp(ui, 1, 1.3));
    const top = ledge;
    // Room above the owl's head first; else the targets move beside the owl.
    const above = fitFont(prompt, lang, wide.right - wide.left, bandBottom - top - 8 - MIN_BAND * moveScale, wideSizes, "wide");
    // Else beside the owl, down to its shields; else beside the owl and its
    // shields, down to the action row.
    const shieldsRight = shieldsX + row.width / 2;
    const sides = [
      { inset: sideInset, bottom: sideBottom },
      { inset: Math.max(0, Math.max(owlArt.right, shieldsRight) + 10 - columnLeft) / moveScale, bottom: actionsTop - 4 },
    ].filter((side) => (columnRight - columnLeft) / moveScale - side.inset >= 130);
    let side: { inset: number; bottom: number } | null = null;
    let fitSide: { fontSize: number; height: number } | null = null;
    if (!above) {
      for (const option of sides) {
        fitSide = fitFont(prompt, lang, wide.right - wide.left, option.bottom - top - 8 - MIN_BAND * moveScale, wideSizes, "wide");
        if (fitSide) {
          side = option;
          break;
        }
      }
    }
    const last = sides[sides.length - 1] ?? { inset: sideInset, bottom: sideBottom };
    const anyFit = above ?? fitSide;
    const fit = anyFit ?? { fontSize: wideSizes[wideSizes.length - 1], height: Math.max(Math.ceil(3 * MIN_BUBBLE_FONT * LINE_HEIGHT + BUBBLE_PAD_Y), last.bottom - top - 8 - MIN_BAND * moveScale) };
    bubble = { fontSize: fit.fontSize, height: fit.height, placement: "wide", scroll: !anyFit, rect: { ...wide, top, bottom: top + fit.height } };
    bandTop = bubble.rect.bottom + 8;
    if (above) bandH = (bandBottom - bandTop) / moveScale;
    else {
      const chosen = side ?? last;
      bandInset = chosen.inset;
      bandH = (chosen.bottom - bandTop) / moveScale;
    }
  }
  const bandHeight = Math.round(clamp(bandH, 40, 300));

  // The catch field: from under the HUD to the action row, the whole column.
  const fieldTop = hudBottom + 4;
  const field = { top: fieldTop, width: (columnRight - columnLeft) / moveScale, height: Math.max(0, (actionsTop - 4 - fieldTop) / moveScale) };
  const margin = 6;
  const toField = (r: Rect): Rect => ({
    left: (r.left - columnLeft) / moveScale - margin,
    top: (r.top - fieldTop) / moveScale - margin,
    right: (r.right - columnLeft) / moveScale + margin,
    bottom: (r.bottom - fieldTop) / moveScale + margin,
  });
  const shieldsRect: Rect = { left: shields.x - row.width / 2, top: shields.top, right: shields.x + row.width / 2, bottom: shields.top + row.height };
  const exclude = [
    toField({ ...bossArt, bottom: Math.max(bossArt.bottom, ledge) }),
    toField(bubble.rect),
    { ...toField(owlArt), bottom: field.height + 1 },
    toField(shieldsRect),
  ];

  return {
    mode: "portrait",
    ui,
    bossSize,
    owlSize,
    boss,
    owl,
    bossArt,
    owlArt,
    close,
    hud: { left: close.right + 8, top: hudTop, right: width - COLUMN_PAD, bottom: hudBottom },
    shields,
    bubble,
    move: { left: columnLeft, right: columnRight, top: bandTop, bottom: moveBottom },
    bandHeight,
    bandInset: Math.round(bandInset),
    actionsHeight,
    actionsInset,
    moveScale,
    catchField: { ...field, exclude },
  };
}

function landscapeGeometry({ width, height, anchors, prompt = "", lang = "en", safeTop = 0, safeBottom = 0 }: GeometryInput): BattleGeometry {
  const ui = clamp(height / 760, 0.8, 1.5);
  const short = height < 500;
  const moveScale = clamp(ui, 1, 1.45);
  const pad = Math.round(clamp(height * 0.025, 10, 28));

  // The cast, sized from the stage's height (about a quarter of it each), on the arena's anchors.
  const charSize = Math.round(clamp(Math.min(height * (short ? 0.33 : 0.29), width * 0.22), 110, 460));
  const bossSize = charSize;
  const owlSize = Math.round(charSize * 0.95);
  const boss = box(anchors.boss.x, anchors.boss.y, bossSize, BOSS_FOOT_X, BOSS_FOOT_Y);
  const owl = box(anchors.owl.x, anchors.owl.y, owlSize, OWL_FOOT_X, OWL_FOOT_Y);
  const bossArt = art(boss, BOSS_ART);
  const owlArt = art(owl, OWL_ART);

  // HUD: close top-left; the boss's name and health top-right, above the boss.
  const closeSize = Math.round(56 * clamp(ui, 0.86, 1.25));
  const close: Rect = { left: pad, top: safeTop + pad, right: pad + closeSize, bottom: safeTop + pad + closeSize };
  const panelW = Math.round(clamp(300 * ui, 220, 440));
  const panelH = Math.round(clamp(66 * ui, 54, 96));
  const panelRight = Math.min(width - pad, (boss.left + boss.right) / 2 + panelW / 2);
  const hud: Rect = { left: panelRight - panelW, top: safeTop + pad, right: panelRight, bottom: safeTop + pad + panelH };

  // The shields row under the owl.
  const row = shieldsRow(ui, short);
  const shieldsX = clamp(anchors.owl.x, row.width / 2 + 6, width - row.width / 2 - 6);
  const actionsHeight = short ? 58 : 76;
  const bottom = height - safeBottom - (short ? 6 : pad);
  const shields = { x: shieldsX, top: Math.round(Math.min(anchors.owl.y + 2, bottom - row.height)), height: row.height, width: row.width, icon: row.icon };

  // The bubble across the top, between the close button and the boss's panel.
  const region = { left: close.right + 14, right: hud.left - 14 };
  const maxW = Math.min(region.right - region.left, 780 * ui);
  const bubbleTop = safeTop + pad;
  const sizes = steps(38, ui * 0.95);
  const room = Math.max(80, Math.min(height * 0.4, Math.min(bossArt.top, owlArt.top) - 16 - bubbleTop));
  const fit = fitFont(prompt, lang, maxW, room, sizes, "top");
  const bubbleH = fit ? fit.height : room;
  // As wide as its text needs (short questions get a compact bubble), centred when it can be.
  const oneLine = prompt.length * (fit?.fontSize ?? MIN_BUBBLE_FONT) * CHAR_EM[lang] + BUBBLE_PAD_X + SPEAKER_W + 8;
  const bubbleW = Math.round(clamp(oneLine, Math.min(maxW, 260 * ui), maxW));
  const centered = width / 2 - bubbleW / 2;
  const bubbleLeft = clamp(centered, region.left, region.right - bubbleW);
  const bubble: BubbleFit = {
    fontSize: fit?.fontSize ?? sizes[sizes.length - 1],
    height: bubbleH,
    placement: "top",
    scroll: !fit,
    rect: { left: bubbleLeft, right: bubbleLeft + bubbleW, top: bubbleTop, bottom: bubbleTop + bubbleH },
  };
  const tailX = clamp((boss.left + boss.right) / 2 - bubble.rect.left, 40, bubbleW - 40);
  const tailAngle = (Math.atan2((boss.left + boss.right) / 2 - (bubble.rect.left + tailX), Math.max(40, bossArt.top - bubble.rect.bottom)) * 180) / Math.PI;
  bubble.tail = { x: tailX, angle: Math.round(clamp(tailAngle, -65, 65)) };

  // The move: between the owl (and its shields) and the boss, under the bubble.
  const shieldsRight = shields.x + row.width / 2;
  const moveLeft = Math.max(owlArt.right, shieldsRight) + 12;
  const moveRight = bossArt.left - 12;
  // Keep the targets centred on the screen when there's room on both sides.
  const half = Math.min(width / 2 - moveLeft, moveRight - width / 2);
  const centredMove = half > 200 * moveScale ? { left: width / 2 - half, right: width / 2 + half } : { left: moveLeft, right: moveRight };
  const moveTop = Math.max(bubble.rect.bottom, hud.bottom) + 14;
  const unscaledH = (bottom - moveTop) / moveScale;
  const bandHeight = Math.round(clamp(unscaledH - actionsHeight - 10, 60, 380));
  const field = { top: moveTop, width: (centredMove.right - centredMove.left) / moveScale, height: Math.max(0, unscaledH - actionsHeight) };

  return {
    mode: "landscape",
    ui,
    bossSize,
    owlSize,
    boss,
    owl,
    bossArt,
    owlArt,
    close,
    hud,
    shields,
    bubble,
    move: { left: centredMove.left, right: centredMove.right, top: moveTop, bottom },
    bandHeight,
    bandInset: 0,
    actionsHeight,
    actionsInset: 0,
    moveScale,
    // The band lies between the two, so nothing in it needs avoiding.
    catchField: { ...field, exclude: [] },
  };
}

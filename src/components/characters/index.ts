/**
 * Big Challenge characters: rigged SVG bosses, the rigged Amal owl, and the
 * layered arena backdrops. See the dev gallery at /dev/characters.
 */
export { BossCharacter, type BossCharacterProps } from "./BossCharacter";
export { OwlCharacter, type OwlCharacterProps } from "./OwlCharacter";
export { ArenaBackdrop, ARENAS, ARENA_ANCHORS_PCT, PARALLAX_DEPTH, placeInArena, type ArenaBackdropProps, type ArenaLayer, type PlacedAnchor } from "./arenas";
export * from "./types";

/**
 * Where the feet are inside each character's square box, as fractions of
 * `size`: put the box at left = footX - size * x, top = footY - size * y.
 */
export const BOSS_FOOT = { x: 0.5, y: 0.94 } as const;
export const OWL_FOOT = { x: 0.5, y: 0.869 } as const;

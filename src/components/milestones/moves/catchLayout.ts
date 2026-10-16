/**
 * Where the catch move's bubbles go: scattered over the whole field, every
 * bubble fully inside it, none touching another or an area to avoid (the
 * boss and its ledge, the speech bubble, the owl and its platform). Pure, so
 * it is unit-tested at real screen sizes.
 *
 * It packs a lattice greedily (row by row, each spot taken where it fits),
 * choosing the biggest bubble (64px, down to 52px) and then the widest gap
 * that still fits the count, and picks a seeded scatter of those spots. A
 * counting question therefore never hides an item.
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CatchLayout {
  /** Bubble diameter in px. */
  size: number;
  /** Top-left corners, in px inside the field. */
  points: Array<{ x: number; y: number }>;
}

/** A tiny seeded random, so a layout stays put across re-renders. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const GAPS = [28, 20, 14, 10, 8, 6, 4];
const STEP = 4;

/** Greedy row-by-row packing of `size` squares, `gap` apart, avoiding `avoid`. */
function pack(width: number, height: number, size: number, gap: number, avoid: Rect[]): Array<{ x: number; y: number }> {
  const placed: Rect[] = [];
  const spots: Array<{ x: number; y: number }> = [];
  for (let y = 0; y + size <= height; y += STEP) {
    for (let x = 0; x + size <= width; x += STEP) {
      const box = { left: x, top: y, right: x + size, bottom: y + size };
      if (avoid.some((zone) => intersects(box, zone))) continue;
      const padded = { left: x - gap, top: y - gap, right: x + size + gap, bottom: y + size + gap };
      if (placed.some((other) => intersects(padded, other))) continue;
      placed.push(box);
      spots.push({ x, y });
      x += size + gap - STEP;
    }
  }
  return spots;
}

export function layoutCatch({
  count,
  width,
  height,
  exclude = [],
  seed = "",
  maxSize = 64,
  minSize = 52,
}: {
  count: number;
  width: number;
  height: number;
  exclude?: Rect[];
  seed?: string;
  maxSize?: number;
  minSize?: number;
}): CatchLayout {
  if (count <= 0 || width <= 0 || height <= 0) return { size: maxSize, points: [] };
  let best: CatchLayout = { size: minSize, points: [] };
  for (let size = maxSize; size >= minSize; size -= 4) {
    for (const gap of GAPS) {
      const spots = pack(width, height, size, gap, exclude);
      if (spots.length < count) {
        if (spots.length > best.points.length) best = { size, points: spots };
        continue;
      }
      // A seeded scatter of the spots, so the set looks thrown, not tiled.
      const random = seeded(`${seed}:${count}`);
      for (let i = spots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      return { size, points: spots.slice(0, count) };
    }
  }
  return best;
}

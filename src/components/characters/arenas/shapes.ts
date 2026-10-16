/**
 * Path builders for the arena illustrations. Many shapes of one colour are
 * merged into a single path so each layer stays at a few dozen nodes.
 */

const f = (n: number) => +n.toFixed(1);

/** A deterministic pseudo-random sequence, so server and client draw the same scene. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A pointed leaf from its base, `deg` clockwise from pointing right. */
export function leaf(x: number, y: number, len: number, w: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const tx = x + dx * len;
  const ty = y + dy * len;
  const mx = x + dx * len * 0.45;
  const my = y + dy * len * 0.45;
  return `M${f(x)} ${f(y)}Q${f(mx - dy * w)} ${f(my + dx * w)} ${f(tx)} ${f(ty)}Q${f(mx + dy * w)} ${f(my - dx * w)} ${f(x)} ${f(y)}Z`;
}

/** A fan of leaves from one point, from `from` to `to` degrees. */
export function fan(x: number, y: number, count: number, len: number, w: number, from: number, to: number, seed = 1) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const deg = from + (to - from) * t + (r() - 0.5) * 8;
    d += leaf(x, y, len * (0.75 + r() * 0.35), w * (0.85 + r() * 0.3), deg);
  }
  return d;
}

/** Union of circles as one path: bushes, canopies, clouds. */
export function blobs(circles: readonly (readonly [number, number, number])[]) {
  return circles
    .map(([x, y, r]) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`)
    .join("");
}

/** A ridge of overlapping circles along a line, closed down to `base`. */
export function canopy(x0: number, x1: number, y: number, r: number, base: number, seed = 1, wobble = 0.5) {
  const rand = rng(seed);
  const circles: [number, number, number][] = [];
  for (let x = x0; x <= x1; x += r * 0.9) {
    circles.push([x, y + (rand() - 0.5) * r * wobble * 2, r * (0.75 + rand() * 0.5)]);
  }
  return `${blobs(circles)}M${f(x0 - r)} ${f(y)}H${f(x1 + r)}V${f(base)}H${f(x0 - r)}Z`;
}

/** Grass tufts: a few thin blades each. */
export function grass(spots: readonly (readonly [number, number, number])[], seed = 3) {
  const r = rng(seed);
  let d = "";
  for (const [x, y, h] of spots) {
    const blades = 4;
    for (let i = 0; i < blades; i += 1) {
      const bx = x + (i - blades / 2) * h * 0.18;
      const lean = (i - blades / 2 + 0.5) * h * 0.22 + (r() - 0.5) * h * 0.2;
      const hh = h * (0.7 + r() * 0.45);
      d += `M${f(bx - h * 0.07)} ${f(y)}Q${f(bx + lean * 0.4)} ${f(y - hh * 0.6)} ${f(bx + lean)} ${f(y - hh)}Q${f(bx + lean * 0.3)} ${f(y - hh * 0.5)} ${f(bx + h * 0.07)} ${f(y)}Z`;
    }
  }
  return d;
}

/** A row of triangles (the Sudanese woven band). Returns one path per colour. */
export function triangleBand(x0: number, x1: number, yBase: number, size: number, colours: readonly string[]) {
  const paths = colours.map(() => "");
  let i = 0;
  for (let x = x0; x < x1; x += size) {
    paths[i % colours.length] += `M${f(x)} ${f(yBase)}L${f(x + size / 2)} ${f(yBase - size)}L${f(x + size)} ${f(yBase)}Z`;
    i += 1;
  }
  return paths.map((d, k) => ({ d, fill: colours[k] }));
}

/** Small scattered dots (stars, pebbles, sand grains). */
export function dots(count: number, x0: number, y0: number, x1: number, y1: number, rMin: number, rMax: number, seed = 7) {
  const r = rng(seed);
  const circles: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) circles.push([x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), rMin + r() * (rMax - rMin)]);
  return blobs(circles);
}

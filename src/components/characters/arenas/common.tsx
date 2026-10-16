import type { ReactNode } from "react";

/**
 * Pieces shared by the arenas.
 */

/**
 * A group that sways gently about a point (a leaf, a frond, a lantern).
 * CSS-animated rotation only; the `amal-sway` keyframes live with the motes
 * in ArenaBackdrop and stop under reduced motion.
 */
export function Sway({ x, y, seconds = 5, degrees = 3, children }: { x: number; y: number; seconds?: number; degrees?: number; children: ReactNode }) {
  return (
    <g
      className="amal-sway"
      style={
        {
          transformOrigin: `${x}px ${y}px`,
          animationDuration: `${seconds}s`,
          "--amal-sway": `${degrees}deg`,
        } as React.CSSProperties
      }
    >
      {children}
    </g>
  );
}

/**
 * A round woven mat (bursh) with the Sudanese triangle trim, for the owl to
 * stand on. Drawn in perspective as an ellipse.
 */
export function HeroMat({ cx, cy, rx, ry, colours = ["#D21034", "#1a1a1a", "#007229"] }: { cx: number; cy: number; rx: number; ry: number; colours?: readonly string[] }) {
  const tris = colours.map(() => "");
  const count = 13;
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * (0.12 + (0.76 * i) / (count - 1)));
    const x = cx + Math.cos(a) * rx * 0.86;
    const y = cy + Math.sin(a) * ry * 0.86;
    const s = 3.4;
    tris[i % colours.length] += `M${(x - s).toFixed(1)} ${(y + s * 0.5).toFixed(1)}L${x.toFixed(1)} ${(y - s * 0.9).toFixed(1)}L${(x + s).toFixed(1)} ${(y + s * 0.5).toFixed(1)}Z`;
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy + 2} rx={rx + 2} ry={ry + 2} fill="#000000" opacity={0.18} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#C98A2E" />
      <ellipse cx={cx} cy={cy - 0.6} rx={rx - 3} ry={ry - 1.6} fill="#E8B04C" />
      <ellipse cx={cx} cy={cy - 1} rx={rx * 0.62} ry={ry * 0.58} fill="none" stroke="#C98A2E" strokeWidth={1.4} />
      <ellipse cx={cx} cy={cy - 1} rx={rx * 0.3} ry={ry * 0.28} fill="#F6CD72" />
      {tris.map((d, i) => (
        <path key={i} d={d} fill={colours[i]} />
      ))}
    </g>
  );
}

/** A soft radial pool of light (a lit focal area, a lantern or sun glow). */
export function Pool({ id, cx, cy, rx, ry, color, strength = 0.55 }: { id: string; cx: number; cy: number; rx: number; ry: number; color: string; strength?: number }) {
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={strength} />
          <stop offset="0.45" stopColor={color} stopOpacity={strength * 0.35} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}

/** A vertical gradient rectangle filling the scene (sky, wall). */
export function Sky({ id, stops, y = 0, height = 844 }: { id: string; stops: readonly (readonly [number, string])[]; y?: number; height?: number }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect x={-10} y={y} width={410} height={height} fill={`url(#${id})`} />
    </>
  );
}

/** A Meroë-style pyramid: steep and narrow, with a little temple porch in front. */
export function meroe(x: number, base: number, w: number, h: number) {
  const f = (n: number) => +n.toFixed(1);
  const pyr = `M${f(x - w / 2)} ${f(base)}L${f(x)} ${f(base - h)}L${f(x + w / 2)} ${f(base)}Z`;
  const pw = w * 0.34;
  const ph = h * 0.22;
  const porch = `M${f(x - pw / 2)} ${f(base)}V${f(base - ph)}H${f(x + pw / 2)}V${f(base)}Z`;
  return { pyr, porch, shade: `M${f(x)} ${f(base - h)}L${f(x + w / 2)} ${f(base)}H${f(x + w * 0.08)}Z` };
}

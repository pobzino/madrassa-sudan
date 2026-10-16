import { HeroMat, Pool, Sky, Sway } from "./common";
import { blobs, dots, fan, rng } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Harf's arena: an old library of scrolls at night. A cool indigo hall with
 * pointed-arch windows and far shelves; warm lantern light, wooden floor and a
 * stack of giant books for the owl. Harf sits on a pile of great tomes.
 */

/** Book spines on a shelf: one path per colour. */
function spines(x0: number, x1: number, yBase: number, hMin: number, hMax: number, colours: readonly string[], seed: number) {
  const r = rng(seed);
  const paths = colours.map(() => "");
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = 6 + r() * 6;
    const h = hMin + r() * (hMax - hMin);
    paths[i % colours.length] += `M${x.toFixed(1)} ${yBase}v${(-h).toFixed(1)}h${(w - 1).toFixed(1)}v${h.toFixed(1)}Z`;
    x += w;
    i += 1 + Math.floor(r() * 2);
  }
  return paths.map((d, k) => ({ d, fill: colours[k] }));
}

/** Rolled scrolls stacked on a shelf (ends facing us). */
function scrolls(cx: number, base: number, rows: number, seed: number) {
  const r = rng(seed);
  const ends: [number, number, number][] = [];
  for (let row = 0; row < rows; row += 1) {
    const n = rows - row + 1;
    for (let i = 0; i < n; i += 1) ends.push([cx + (i - (n - 1) / 2) * 15 + (r() - 0.5) * 2, base - 7 - row * 13, 7]);
  }
  return { ends: blobs(ends), cores: blobs(ends.map(([x, y]) => [x, y, 2.4] as const)) };
}

function Back({ uid }: { uid: string }) {
  const far = spines(-10, 120, 300, 26, 40, ["#2C2A5C", "#363269", "#2A3A63"], 3);
  const far2 = spines(-10, 120, 400, 24, 40, ["#2C2A5C", "#3A3070", "#2A3A63"], 4);
  return (
    <>
      <Sky id={`${uid}-wall`} stops={[[0, "#0F1330"], [0.5, "#1B1F47"], [1, "#272554"]]} />
      {/* tall pointed-arch windows onto the night */}
      <path d="M170 380 V170 C170 120 200 90 225 70 C250 90 280 120 280 170 V380Z" fill="#2E2C61" />
      <path d="M180 372 V172 C180 130 204 104 225 86 C246 104 270 130 270 172 V372Z" fill="#203F78" />
      <path d={dots(9, 186, 110, 264, 300, 0.8, 1.6, 8)} fill="#FFFFFF" opacity={0.8} />
      <path d="M244 132 a16 16 0 1 0 14 22 a12 12 0 1 1 -14 -22Z" fill="#FFF3D0" />
      <path d="M225 86 V372 M180 250 H270" stroke="#2E2C61" strokeWidth={5} />
      <path d="M330 380 V200 C330 168 350 150 366 136 C382 150 402 168 402 200 V380Z" fill="#2E2C61" />
      <path d="M338 372 V202 C338 176 354 160 366 150 C378 160 394 176 394 202 V372Z" fill="#203F78" />
      {/* far shelves on the left */}
      <path d="M-10 200 H128 V470 H-10Z" fill="#1E1A40" />
      {far.concat(far2).map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} />
      ))}
      <path d="M-10 300 H128 M-10 400 H128" stroke="#3B2A4A" strokeWidth={6} />
      {/* lantern glow behind Harf */}
      <Pool id={`${uid}-glow`} cx={287} cy={270} rx={210} ry={220} color="#FFC870" />
      {/* back floor */}
      <path d="M-10 470 H400 V860 H-10Z" fill="#2B1E2E" />
    </>
  );
}

function Mid({ uid }: { uid: string }) {
  const s1 = scrolls(40, 520, 3, 5);
  return (
    <>
      {/* the wooden floor receding, kept calm for the answer band */}
      <path d="M-10 470 H400 V720 H-10Z" fill="#4A2E24" />
      <path d="M-10 520 H400 M-10 580 H400 M-10 650 H400" stroke="#3E261E" strokeWidth={3} />
      {/* a scroll shelf on the left */}
      <path d="M-10 420 H90 V530 H-10Z" fill="#5A3A22" />
      <path d="M-10 424 H86 V524 H-10Z" fill="#3A2416" />
      <path d={s1.ends} fill="#F3E3BF" />
      <path d={s1.cores} fill="#C9A86A" />
      <path d="M26 484 h8 v20 h-8Z M54 498 h6 v14 h-6Z" fill="#D21034" />
      <path d="M40 470 h6 v18 h-6Z" fill="#007229" />
      {/* hanging lanterns (fanous) */}
      <Sway x={110} y={-10} seconds={4.5} degrees={3}>
        <path d="M110 -10 V96" stroke="#8A6A3A" strokeWidth={2} />
        <Pool id={`${uid}-lamp1`} cx={110} cy={120} rx={60} ry={60} color="#FFC870" strength={0.6} />
        <path d="M98 100 H122 L128 120 L118 142 H102 L92 120Z" fill="#E39A10" />
        <path d="M102 106 H118 L122 120 L115 136 H105 L98 120Z" fill="#FFE08A" />
        <path d="M104 142 H116 L110 150Z" fill="#E39A10" />
      </Sway>
      {/* Harf's pile of great tomes */}
      <ellipse cx={287} cy={402} rx={100} ry={12} fill="#000000" opacity={0.35} />
      <path d="M186 362 H392 a6 6 0 0 1 6 6 V392 a6 6 0 0 1 -6 6 H186 a6 6 0 0 1 -6 -6 V368 a6 6 0 0 1 6 -6Z" fill="#0B6B33" />
      <path d="M380 364 H396 V396 H380Z" fill="#F3E3BF" />
      <path d="M190 380 H370" stroke="#F5B324" strokeWidth={3} />
      <path d="M194 336 H384 a6 6 0 0 1 6 6 V362 H188 V342 a6 6 0 0 1 6 -6Z" fill="#B3122E" />
      <path d="M190 338 H206 V362 H190Z" fill="#F3E3BF" />
      <path d="M220 350 H372" stroke="#F5B324" strokeWidth={2.6} />
      <path d="M188 330 C200 322 374 322 390 330 V338 H188Z" fill="#D63A55" />
      <path d="M194 326 C220 320 260 320 288 320" stroke="#FFE1E7" strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9A6436" />
          <stop offset="1" stopColor="#6E4425" />
        </linearGradient>
      </defs>
      {/* warm foreground floor and a red rug */}
      <path d="M-10 736 H400 V860 H-10Z" fill={`url(#${uid}-wood)`} />
      <path d="M-10 780 H400 M-10 820 H400" stroke="#5E3A1F" strokeWidth={3} opacity={0.6} />
      <path d="M150 760 H420 V860 H130Z" fill="#B3122E" />
      <path d="M156 768 H420 M140 852 H420" stroke="#F5B324" strokeWidth={3} />
      {/* the owl's stack of giant books, lit by a lamp */}
      <Pool id={`${uid}-hero`} cx={104} cy={604} rx={170} ry={150} color="#FFD98A" strength={0.55} />
      <path d="M-10 690 H214 a8 8 0 0 1 8 8 V728 a8 8 0 0 1 -8 8 H-10Z" fill="#1F4E8C" />
      <path d="M196 692 H220 V734 H196Z" fill="#F3E3BF" />
      <path d="M-10 712 H190" stroke="#F5B324" strokeWidth={3} />
      <path d="M0 656 H200 a8 8 0 0 1 8 8 V690 H-6 V664 a8 8 0 0 1 6 -8Z" fill="#E39A10" />
      <path d="M0 658 H18 V690 H0Z" fill="#F3E3BF" />
      <path d="M30 674 H190" stroke="#8A4A08" strokeWidth={2.6} />
      <path d="M-4 646 C10 634 196 634 210 646 V658 H-4Z" fill="#F5B324" />
      <path d="M4 640 C40 634 80 633 110 633" stroke="#FFF1C2" strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
      <HeroMat cx={102} cy={644} rx={50} ry={8} />
      <path d={dots(10, 200, 790, 390, 840, 1.2, 2.4, 13)} fill="#F5B324" opacity={0.5} />
      {/* framing: heavy drapes above, a potted palm below right */}
      <Sway x={-10} y={-10} seconds={7} degrees={1.5}>
        <path d="M-10 -10 H90 C70 60 40 150 30 300 C20 330 0 336 -10 330Z" fill="#6E0F22" />
        <path d="M60 -10 C50 70 30 170 22 300" stroke="#8E1A30" strokeWidth={6} fill="none" />
      </Sway>
      <path d="M400 -10 H300 C320 60 350 150 360 300 C370 330 390 336 400 330Z" fill="#6E0F22" />
      <path d="M-10 -10 H400 V22 H-10Z" fill="#4A0A17" />
      <path d="M-10 22 H400" stroke="#F5B324" strokeWidth={3} />
      <path d={fan(380, 830, 7, 130, 18, -170, -80, 81)} fill="#14502A" />
      <path d={fan(380, 830, 4, 90, 13, -160, -100, 82)} fill="#1E6B38" />
      <path d="M346 860 L356 812 H404 V860Z" fill="#B36A32" />
      <path d={fan(-10, 860, 5, 110, 18, -80, -20, 83)} fill="#14502A" />
    </>
  );
}

export const harfLibrary: ArenaDef = {
  name: "The scroll library",
  base: "#1B1F47",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 326 }, owl: { x: 102, y: 644 } },
  motes: { color: "#FFE7B0", glow: "rgba(255, 200, 112, 0.45)" },
};

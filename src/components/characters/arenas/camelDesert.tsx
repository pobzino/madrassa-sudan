import { HeroMat, meroe, Pool, Sky, Sway } from "./common";
import { blobs, dots, fan, grass, leaf } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Harfi's arena: the desert at golden hour by the pyramids of Meroë. A cool
 * blue-lavender sky and mauve far dunes; warm sand up front. Harfi on a
 * sandstone outcrop, the owl on a sunlit dune.
 */

const PYRAMIDS = [
  meroe(48, 420, 40, 92),
  meroe(92, 424, 34, 72),
  meroe(128, 426, 26, 54),
  meroe(206, 418, 30, 66),
  meroe(352, 424, 36, 80),
];

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#24427E"], [0.3, "#5C66A8"], [0.52, "#B48BB0"], [0.62, "#F2B58A"]]} />
      <path d={dots(22, 0, 10, 390, 200, 0.8, 1.6, 5)} fill="#FFFFFF" opacity={0.7} />
      {/* a crescent moon in the cool sky */}
      <path d="M78 96 a24 24 0 1 0 22 32 a19 19 0 1 1 -22 -32Z" fill="#FFF3D0" />
      {/* the low sun behind Harfi's outcrop */}
      <Pool id={`${uid}-sun`} cx={290} cy={300} rx={230} ry={220} color="#FFD68A" strength={0.7} />
      <circle cx={300} cy={330} r={46} fill="#FFE2A6" opacity={0.85} />
      {/* far mauve dunes and the Meroë pyramids */}
      <path d="M-10 430 C60 404 130 410 200 422 C270 434 330 410 400 418 V520 H-10Z" fill="#B9849A" />
      {PYRAMIDS.map((p, i) => (
        <g key={i}>
          <path d={p.pyr} fill="#8A5F72" />
          <path d={p.shade} fill="#6E4A62" />
          <path d={p.porch} fill="#7A526A" />
        </g>
      ))}
      <path d="M-10 452 C70 432 150 440 230 452 C300 462 350 446 400 448 V560 H-10Z" fill="#C99A8A" />
    </>
  );
}

function Mid() {
  return (
    <>
      {/* middle dunes, kept calm for the answer band */}
      <path d="M-10 480 C80 456 170 470 250 486 C320 500 360 480 400 476 V720 H-10Z" fill="#D9A066" />
      <path d="M-10 540 C90 520 200 534 280 552 C340 566 370 552 400 548 V720 H-10Z" fill="#E2AE70" />
      {/* a date palm on the left */}
      <path d="M34 520 C30 470 36 420 52 380" stroke="#7A5232" strokeWidth={9} strokeLinecap="round" fill="none" />
      <Sway x={52} y={380} seconds={6} degrees={2.5}>
        <path d={fan(52, 380, 7, 70, 12, -170, -10, 61)} fill="#2F6B33" />
        <path d={blobs([[48, 388, 5], [56, 390, 5], [52, 396, 5]])} fill="#B8662C" />
      </Sway>
      <HarfiLedge />
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4CC8A" />
          <stop offset="1" stopColor="#D99C55" />
        </linearGradient>
      </defs>
      <path d="M-10 740 C90 712 200 714 290 728 C340 736 372 730 400 720 V860 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d="M150 772 Q200 762 250 772 M220 800 Q280 790 340 800 M120 820 Q170 812 220 822" stroke="#C98A44" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.6} />
      {/* the owl's sunlit dune */}
      <Pool id={`${uid}-hero`} cx={104} cy={604} rx={170} ry={150} color="#FFE2A3" />
      <path d="M-10 650 C10 626 60 618 108 618 C160 618 204 632 222 656 C230 690 190 718 140 728 C80 738 20 736 -10 732Z" fill="#E9B46C" />
      <path d="M-10 690 C40 712 120 716 180 704 C206 698 220 684 224 666 C226 696 196 718 150 728 C90 740 20 738 -10 732Z" fill="#CF9450" />
      <ellipse cx={102} cy={640} rx={112} ry={20} fill="#F2C882" />
      <path d="M-6 640 C20 626 60 620 100 619" stroke="#FFF4D8" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.9} />
      <path d="M40 690 Q80 682 120 690 M70 708 Q120 700 170 708" stroke="#C98A44" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.6} />
      <HeroMat cx={102} cy={642} rx={52} ry={10} />
      <path d={dots(12, 160, 760, 380, 840, 1.4, 3, 9)} fill="#B97B3C" />
      {/* framing: palm fronds above, desert shrubs below */}
      <Sway x={-10} y={-20} seconds={6.5}>
        <path d={fan(-10, -20, 6, 170, 22, 10, 95, 71)} fill="#1F4A26" />
      </Sway>
      <path d={fan(400, -20, 6, 170, 22, 85, 170, 72)} fill="#1F4A26" />
      <path d={fan(-10, -20, 4, 120, 16, 25, 80, 73) + fan(400, -20, 4, 120, 16, 100, 155, 74)} fill="#2F6B33" />
      <path d={blobs([[-6, 820, 46], [40, 846, 40], [380, 830, 48], [340, 854, 36]])} fill="#6E7A2E" />
      <path d={fan(-10, 860, 6, 110, 14, -90, -20, 75) + fan(400, 860, 6, 110, 14, -160, -90, 76)} fill="#4F5E22" />
      <path d={leaf(370, 580, 60, 12, -150) + leaf(374, 600, 70, 13, -170) + leaf(376, 620, 56, 11, 170)} fill="#3E5A26" />
    </>
  );
}

export const camelDesert: ArenaDef = {
  name: "The pyramids of Meroë",
  base: "#B48BB0",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 328 }, owl: { x: 102, y: 642 } },
  motes: { color: "#FFF1D0", glow: "rgba(255, 214, 138, 0.5)" },
};

/** Harfi's sandstone outcrop, standing on (287, 328). Shared with the landscape arena. */
export function HarfiLedge() {
  return (
    <>
      {/* Harfi's sandstone outcrop */}
      <ellipse cx={287} cy={402} rx={96} ry={12} fill="#7A4A2A" opacity={0.3} />
      <path d="M176 334 C180 318 222 310 287 310 C352 310 394 318 398 334 L392 372 C370 392 320 398 288 398 C250 398 204 392 182 372Z" fill="#B9733C" />
      <path d="M182 356 C214 378 256 384 290 384 C330 384 366 378 394 354 L392 372 C370 392 320 398 288 398 C250 398 204 392 182 372Z" fill="#94562A" />
      <path d="M188 344 H392 M196 366 H384" stroke="#A3632F" strokeWidth={2.2} opacity={0.8} />
      <ellipse cx={287} cy={327} rx={110} ry={18} fill="#E6B172" />
      <ellipse cx={280} cy={323} rx={90} ry={10} fill="#F3CD94" />
      <path d="M182 330 C200 318 240 313 270 312" stroke="#FFF1D2" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.85} />
      <path d={grass([[190, 330, 12], [384, 328, 14]], 63)} fill="#8C9A3C" />
    </>
  );
}

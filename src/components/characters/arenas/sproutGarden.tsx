import { HeroMat, Pool, Sky, Sway } from "./common";
import { blobs, dots, fan, grass } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Sprouty's arena: a garden on the banks of the Nile. Cool morning sky,
 * palms on the far bank and a felucca on the river; warm green-gold grass up
 * front with karkadeh (hibiscus) bushes. Sprouty on a raised garden bed.
 */

/** Hibiscus blooms: five round petals each. */
function blooms(at: readonly (readonly [number, number, number])[]) {
  const petals: [number, number, number][] = [];
  const centres: [number, number, number][] = [];
  for (const [x, y, s] of at) {
    for (let k = 0; k < 5; k += 1) {
      const a = ((k * 72 - 90) * Math.PI) / 180;
      petals.push([x + Math.cos(a) * 4 * s, y + Math.sin(a) * 4 * s, 3.8 * s]);
    }
    centres.push([x, y, 1.8 * s]);
  }
  return { petals: blobs(petals), centres: blobs(centres) };
}

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#4E86C7"], [0.4, "#8CC2E6"], [0.55, "#CDE8F0"]]} />
      <path d={blobs([[60, 120, 22], [86, 112, 26], [112, 122, 20], [250, 70, 18], [272, 64, 22], [294, 72, 16]])} fill="#FFFFFF" opacity={0.75} />
      <Pool id={`${uid}-sun`} cx={290} cy={270} rx={220} ry={220} color="#FFE7A0" strength={0.7} />
      <circle cx={300} cy={236} r={34} fill="#FFF1C2" opacity={0.9} />
      {/* far bank with palms */}
      <path d="M-10 420 C80 408 200 412 400 418 V470 H-10Z" fill="#6FA08C" />
      <path d="M40 420 V372 M70 418 V380 M330 418 V366 M356 420 V384" stroke="#4E6E62" strokeWidth={4} strokeLinecap="round" />
      <path d={fan(40, 372, 6, 26, 5, -170, -10, 51) + fan(70, 380, 6, 22, 4, -170, -10, 52) + fan(330, 366, 6, 28, 5, -170, -10, 53) + fan(356, 384, 6, 22, 4, -170, -10, 54)} fill="#4E7E6A" />
      {/* the Nile, with a felucca */}
      <path d="M-10 440 C120 434 260 438 400 444 V492 C260 486 120 484 -10 490Z" fill="#3E8FC0" />
      <path d="M30 458 H90 M150 470 H230 M280 460 H340" stroke="#9FD3EE" strokeWidth={2.4} strokeLinecap="round" opacity={0.8} />
      <path d="M134 456 H170 L164 464 H140Z" fill="#7A4A1F" />
      <path d="M152 456 V408 L176 452Z" fill="#E6E2D4" />
      <path d="M150 456 V414 L134 448Z" fill="#D2C6A6" />
    </>
  );
}

function Mid() {
  const left = blooms([[22, 470, 1.2], [52, 490, 1], [10, 510, 1.1]]);
  const ledge = blooms([[196, 326, 1], [380, 324, 1.1], [214, 340, 0.8]]);
  return (
    <>
      {/* the near bank meadow, kept calm for the answer band */}
      <path d="M-10 488 C90 480 220 484 400 494 V720 H-10Z" fill="#5E9A3E" />
      <path d="M-10 548 C120 536 260 540 400 552 V720 H-10Z" fill="#6AA545" />
      {/* karkadeh bushes */}
      <path d={blobs([[10, 480, 40], [56, 500, 30], [0, 520, 30]])} fill="#2F7A37" />
      <path d={left.petals} fill="#E23D5A" />
      <path d={left.centres} fill="#FFD34D" />
      {/* Sprouty's raised garden bed */}
      <ellipse cx={287} cy={402} rx={98} ry={12} fill="#2A3A12" opacity={0.3} />
      <path d="M180 334 C182 318 222 310 287 310 C352 310 392 318 394 334 L388 376 C366 394 320 400 287 400 C252 400 206 394 186 376Z" fill="#8A5A34" />
      <path d="M186 358 C214 378 256 384 290 384 C330 384 364 378 390 356 L388 376 C366 394 320 400 287 400 C252 400 206 394 186 376Z" fill="#6E4527" />
      <path d="M192 346 h12 v6 h-12Z M232 352 h12 v6 h-12Z M330 352 h12 v6 h-12Z M366 344 h12 v6 h-12Z" fill="#5E3A1F" opacity={0.6} />
      <ellipse cx={287} cy={326} rx={108} ry={19} fill="#7BB847" />
      <ellipse cx={280} cy={322} rx={90} ry={11} fill="#9BD15C" />
      <path d={grass([[188, 332, 16], [388, 328, 16], [206, 342, 12], [370, 342, 12]], 55)} fill="#4E9A34" />
      <path d={ledge.petals} fill="#E23D5A" />
      <path d={ledge.centres} fill="#FFD34D" />
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  const front = blooms([[30, 800, 1.4], [60, 780, 1.2], [360, 790, 1.4], [334, 812, 1.2]]);
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9CF5E" />
          <stop offset="1" stopColor="#86A83C" />
        </linearGradient>
      </defs>
      <path d="M-10 740 C90 716 200 716 290 728 C340 734 372 728 400 720 V860 H-10Z" fill={`url(#${uid}-field)`} />
      <path d="M190 860 C210 812 250 778 310 744 L340 748 C290 784 262 818 256 860Z" fill="#E7C98E" opacity={0.85} />
      {/* the owl's grassy hill in the sun */}
      <Pool id={`${uid}-hero`} cx={104} cy={604} rx={170} ry={150} color="#FFE7A0" strength={0.6} />
      <path d="M-10 650 C10 626 60 618 108 618 C160 618 204 632 220 656 C226 688 196 716 146 728 C86 738 20 736 -10 732Z" fill="#8A5A34" />
      <path d="M-10 690 C40 712 120 716 180 704 C206 698 218 684 222 668 C222 698 196 718 150 728 C90 740 20 738 -10 732Z" fill="#6E4527" />
      <ellipse cx={102} cy={640} rx={112} ry={20} fill="#8CC24E" />
      <ellipse cx={98} cy={636} rx={94} ry={12} fill="#A8D664" />
      <path d="M-6 640 C20 626 60 620 100 619" stroke="#F4FBD0" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.85} />
      <path d={grass([[0, 642, 22], [200, 644, 18], [20, 654, 14], [180, 654, 12]], 57)} fill="#4E9A34" />
      <HeroMat cx={100} cy={642} rx={50} ry={10} />
      <path d={dots(10, 190, 780, 390, 840, 1.2, 2.6, 19)} fill="#FFF3B0" opacity={0.7} />
      {/* framing: banana leaves and blooms */}
      <Sway x={-14} y={870} seconds={5.5}>
        <path d={fan(-14, 870, 6, 190, 34, -95, -20, 91)} fill="#1F6B2E" />
      </Sway>
      <path d={fan(404, 870, 6, 190, 34, -160, -85, 92)} fill="#1F6B2E" />
      <path d={fan(-10, 860, 4, 120, 20, -80, -30, 93) + fan(400, 860, 4, 120, 20, -150, -100, 94)} fill="#2E8B3E" />
      <Sway x={404} y={-14} seconds={6.5} degrees={-2.5}>
        <path d={fan(404, -14, 5, 170, 30, 85, 165, 95)} fill="#1A5A28" />
      </Sway>
      <path d={fan(-14, -14, 5, 170, 30, 15, 95, 96)} fill="#1A5A28" />
      <path d={front.petals} fill="#E23D5A" />
      <path d={front.centres} fill="#FFD34D" />
    </>
  );
}

export const sproutGarden: ArenaDef = {
  name: "The Nile garden",
  base: "#8CC2E6",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 328 }, owl: { x: 100, y: 642 } },
  motes: { color: "#FFF7B0", glow: "rgba(253, 230, 138, 0.55)" },
};

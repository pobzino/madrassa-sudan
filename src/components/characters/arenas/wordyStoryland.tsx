import { HeroMat, Pool, Sky, Sway } from "./common";
import { blobs, canopy, dots, fan, grass, rng } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Wordy's arena: Storyland at dusk. Hills made of stacked books under a cool
 * violet-teal sky with drifting letters; Wordy on a giant open book, the owl
 * on a warm grassy knoll strewn with little books.
 */

/** A stack of books as a hill silhouette. */
export function bookHill(x: number, base: number, w: number, layers: number, h: number, seed: number) {
  const r = rng(seed);
  let d = "";
  let y = base;
  let width = w;
  for (let i = 0; i < layers; i += 1) {
    const off = (r() - 0.5) * 16;
    d += `M${(x - width / 2 + off).toFixed(1)} ${y}h${width.toFixed(1)}v${(-h).toFixed(1)}h${(-width).toFixed(1)}Z`;
    y -= h;
    width *= 0.78;
  }
  return d;
}

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#1C1745"], [0.35, "#3A2F78"], [0.6, "#3E6C93"]]} />
      <path d={dots(26, 0, 10, 390, 300, 0.7, 1.6, 31)} fill="#FFFFFF" opacity={0.75} />
      <path d="M318 70 a28 28 0 1 0 26 38 a22 22 0 1 1 -26 -38Z" fill="#FFF3D0" />
      {/* drifting letters */}
      <g fill="#7C83C9" opacity={0.55} fontWeight={700} fontFamily="var(--font-fredoka), Fredoka, sans-serif">
        <text x={40} y={150} fontSize={34} transform="rotate(-12 50 140)">A</text>
        <text x={140} y={96} fontSize={26}>b</text>
        <text x={200} y={190} fontSize={30} fontFamily="var(--font-cairo), Cairo, sans-serif">ك</text>
        <text x={66} y={250} fontSize={24} fontFamily="var(--font-cairo), Cairo, sans-serif">م</text>
      </g>
      <Pool id={`${uid}-glow`} cx={287} cy={280} rx={210} ry={220} color="#FFD98A" strength={0.5} />
      {/* far hills of stacked books */}
      <path d={bookHill(70, 450, 150, 5, 22, 3) + bookHill(330, 450, 130, 4, 24, 4)} fill="#2E3470" />
      <path d={bookHill(200, 460, 170, 4, 20, 5)} fill="#3A4A86" />
      <path d={canopy(-30, 420, 470, 22, 760, 12, 0.6)} fill="#264E6A" />
    </>
  );
}

function Mid() {
  return (
    <>
      {/* a calm meadow for the answer band */}
      <path d="M-10 480 C90 466 220 470 400 484 V720 H-10Z" fill="#2F6B5C" />
      <path d="M-10 540 C120 526 260 532 400 546 V720 H-10Z" fill="#37775F" />
      {/* round story trees */}
      <path d="M30 520 V440 M372 520 V450" stroke="#4A3A5A" strokeWidth={8} strokeLinecap="round" />
      <path d={blobs([[30, 420, 32], [10, 440, 24], [52, 444, 24], [372, 430, 30], [350, 450, 22], [392, 450, 22]])} fill="#2A8C7A" />
      <path d={blobs([[22, 410, 12], [364, 420, 11]])} fill="#47B39C" opacity={0.6} />
      <WordyLedge />
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B7C760" />
          <stop offset="1" stopColor="#7E9E3C" />
        </linearGradient>
      </defs>
      <path d="M-10 740 C90 716 200 716 290 728 C340 734 372 728 400 720 V860 H-10Z" fill={`url(#${uid}-grass)`} />
      <path d="M170 860 C200 800 240 770 300 740 L330 744 C280 776 250 810 240 860Z" fill="#E7C98E" opacity={0.8} />
      {/* the owl's grassy knoll, with little books lying about */}
      <Pool id={`${uid}-hero`} cx={104} cy={604} rx={170} ry={150} color="#FFE2A3" strength={0.55} />
      <path d="M-10 650 C10 626 60 618 108 618 C160 618 204 632 220 656 C226 688 196 716 146 728 C86 738 20 736 -10 732Z" fill="#6E9A3A" />
      <path d="M-10 690 C40 712 120 716 180 704 C206 698 218 684 222 668 C222 698 196 718 150 728 C90 740 20 738 -10 732Z" fill="#557F2C" />
      <ellipse cx={102} cy={640} rx={112} ry={20} fill="#9CC456" />
      <ellipse cx={98} cy={636} rx={94} ry={12} fill="#B6D670" />
      <path d="M-6 640 C20 626 60 620 100 619" stroke="#F4FBD0" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.85} />
      <path d={grass([[0, 642, 22], [200, 644, 18], [20, 654, 14]], 37)} fill="#4E8A2A" />
      <path d="M150 650 l26 -4 l4 10 l-26 4Z" fill="#D21034" />
      <path d="M152 652 l22 -3" stroke="#FFFDF5" strokeWidth={2} />
      <path d="M20 662 l22 3 l-2 9 l-22 -3Z" fill="#1F4E8C" />
      <HeroMat cx={100} cy={642} rx={50} ry={10} />
      {/* framing: dark teal leaves and pink blossoms */}
      <Sway x={-14} y={870} seconds={5.5}>
        <path d={fan(-14, 870, 7, 170, 26, -95, -15, 41)} fill="#123E44" />
      </Sway>
      <path d={fan(404, 870, 7, 170, 26, -165, -85, 42)} fill="#123E44" />
      <path d={fan(-10, 860, 5, 110, 18, -80, -25, 43) + fan(400, 860, 5, 110, 18, -155, -100, 44)} fill="#1E6B5A" />
      <path d={fan(-14, -14, 6, 150, 24, 15, 100, 45) + fan(404, -14, 6, 150, 24, 80, 165, 46)} fill="#0E1C3A" />
      <path d={blobs([[30, 40, 7], [52, 70, 6], [356, 52, 7], [338, 84, 6], [20, 800, 7], [370, 790, 7]])} fill="#F28CB8" />
    </>
  );
}

export const wordyStoryland: ArenaDef = {
  name: "Storyland",
  base: "#2B2A63",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 346 }, owl: { x: 102, y: 642 } },
  motes: { color: "#D9F99D", glow: "rgba(190, 242, 100, 0.5)" },
};

/** Wordy's giant open book, standing on (287, 346). Shared with the landscape arena. */
export function WordyLedge() {
  return (
    <>
      {/* Wordy's giant open book */}
      <ellipse cx={287} cy={404} rx={104} ry={12} fill="#000000" opacity={0.3} />
      <path d="M178 344 L287 356 L396 344 L396 386 L287 400 L178 386Z" fill="#007229" />
      <path d="M182 340 C220 328 260 330 287 346 V392 C260 378 220 376 182 384Z" fill="#FFFDF5" />
      <path d="M392 340 C354 328 314 330 287 346 V392 C314 378 354 376 392 384Z" fill="#F1EADB" />
      <path d="M182 384 C220 376 260 378 287 392 C314 378 354 376 392 384 L392 390 C354 382 314 384 287 398 C260 384 220 382 182 390Z" fill="#E2D6BE" />
      <path d="M198 348 L270 352 M198 358 L268 362 M198 368 L262 372 M306 352 L376 348 M308 362 L376 358 M312 372 L376 368" stroke="#A3B1C6" strokeWidth={2} strokeLinecap="round" />
      <path d="M287 346 V392" stroke="#CDBF9F" strokeWidth={2} />
      <path d={grass([[180, 388, 14], [394, 386, 14]], 33)} fill="#5BBF7A" />
    </>
  );
}

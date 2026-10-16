import { HeroMat, Sway } from "./common";
import { blobs, canopy, dots, fan, grass, leaf } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Numbo's arena: a jungle clearing at the mouth of a mossy cave, in Sudan
 * greens. Cool teal depths behind, a warm lit clearing in front; Numbo on a
 * rock ledge upper right, the owl on a sunlit earth mound lower left.
 */

function Back({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03211A" />
          <stop offset="0.45" stopColor="#0A3A2C" />
          <stop offset="1" stopColor="#0F4A33" />
        </linearGradient>
        <radialGradient id={`${uid}-pool`}>
          <stop offset="0" stopColor="#FBE7A1" stopOpacity="0.6" />
          <stop offset="0.4" stopColor="#F5C451" stopOpacity="0.22" />
          <stop offset="1" stopColor="#F5C451" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={390} height={844} fill={`url(#${uid}-sky)`} />
      {/* misty far trunks */}
      <path d="M36 0H56L64 560H28Z M108 0H116L122 520H102Z M330 0H350L360 300H322Z M370 0H384L392 360H364Z" fill="#0D4030" opacity={0.75} />
      {/* the cave wall behind Numbo, with numbers worn into the rock */}
      <path d="M150 470 C150 330 180 190 262 150 C320 122 376 136 404 170 V470Z" fill="#0B3528" />
      <text x={200} y={250} fontSize={58} fontWeight={700} fill="#104536" fontFamily="var(--font-fredoka), Fredoka, sans-serif" transform="rotate(-8 220 230)">
        7
      </text>
      <text x={20} y={330} fontSize={74} fontWeight={700} fill="#0E4232" fontFamily="var(--font-fredoka), Fredoka, sans-serif" transform="rotate(10 50 300)">
        3
      </text>
      <text x={122} y={170} fontSize={44} fontWeight={700} fill="#0E4232" fontFamily="var(--font-fredoka), Fredoka, sans-serif">
        +
      </text>
      {/* light falling into the clearing */}
      <path d="M236 -10 H290 L360 560 H236Z M302 -10 H326 L400 420 H350Z" fill="#FFF3C4" opacity={0.06} />
      <ellipse cx={287} cy={262} rx={215} ry={225} fill={`url(#${uid}-pool)`} />
      {/* top canopy */}
      <path d={`${blobs([[10, 20, 50], [80, 0, 46], [150, 14, 34], [250, -6, 40], [330, 16, 52], [390, 4, 44]])}M-10 -10H400V10H-10Z`} fill="#021A12" />
      {/* far tree line */}
      <path d={canopy(-30, 420, 432, 32, 760, 4)} fill="#0C3D29" />
      <path d={canopy(-30, 420, 466, 24, 760, 9, 0.8)} fill="#11492F" />
    </>
  );
}

function Mid() {
  return (
    <>
      {/* hanging vines */}
      <path d="M44 -4 C56 60 30 120 46 196 M150 -4 C140 40 162 80 150 120 M362 -4 C354 50 374 92 362 150" stroke="#0E4422" strokeWidth={3} fill="none" strokeLinecap="round" />
      <path
        d={leaf(46, 60, 16, 5, 30) + leaf(40, 110, 18, 5, 160) + leaf(46, 160, 16, 5, 20) + leaf(152, 70, 14, 4, 150) + leaf(364, 60, 15, 4, 160) + leaf(366, 110, 16, 5, 20)}
        fill="#17643A"
      />
      {/* the lit clearing and a path from the owl's mound up to the ledge */}
      <ellipse cx={200} cy={572} rx={270} ry={100} fill="#1B5A2E" />
      <ellipse cx={226} cy={552} rx={176} ry={54} fill="#2C6A30" opacity={0.7} />
      <path d="M150 640 C190 606 228 580 262 556 C280 542 292 528 298 514 L316 516 C312 534 298 552 278 568 C246 594 214 620 196 646Z" fill="#B39A62" opacity={0.18} />
      {/* bushes ringing the clearing */}
      <path d={blobs([[-14, 500, 54], [44, 520, 40], [0, 560, 40]])} fill="#11522A" />
      <path d={fan(6, 560, 6, 96, 16, -80, 5, 2)} fill="#1D7038" />
      <path d={blobs([[396, 520, 50], [356, 540, 34], [390, 580, 40]])} fill="#11522A" />
      <path d={fan(392, 584, 6, 90, 16, -178, -95, 5)} fill="#1D7038" />
      {/* mossy stones */}
      <path d="M118 520 C118 504 150 500 158 514 C162 526 120 530 118 520Z M318 600 C316 586 346 580 356 594 C360 606 320 610 318 600Z" fill="#2F4A3C" />
      <path d="M122 512 C130 502 150 502 156 510 C146 506 132 508 122 512Z M322 592 C330 584 346 582 352 590 C342 586 332 588 322 592Z" fill="#4E8A3C" />
      <NumboLedge />
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EED6A0" />
          <stop offset="1" stopColor="#CFA463" />
        </linearGradient>
        <radialGradient id={`${uid}-hero`}>
          <stop offset="0" stopColor="#FFE7A3" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#FCD34D" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FCD34D" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* warm foreground floor */}
      <path d="M-10 742 C80 716 200 712 290 726 C340 734 372 728 400 718 V860 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d={dots(14, 150, 760, 380, 840, 1.6, 3.4, 21)} fill="#B88A4E" />
      {/* the owl's hero mound, in its own pool of light */}
      <ellipse cx={104} cy={600} rx={170} ry={150} fill={`url(#${uid}-hero)`} />
      <path d="M-10 646 C4 628 50 620 104 620 C160 620 202 630 214 648 C222 668 212 694 186 708 C150 726 60 730 -10 724Z" fill="#9C7443" />
      <path d="M-10 680 C30 700 110 706 170 696 C196 690 210 678 215 662 C214 690 198 708 170 718 C110 734 40 732 -10 724Z" fill="#7A5530" />
      <path d="M40 690 L52 702 M150 692 L142 706 M96 700 L102 714" stroke="#5E4022" strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <ellipse cx={102} cy={640} rx={112} ry={22} fill="#C9A464" />
      <ellipse cx={98} cy={636} rx={96} ry={14} fill="#E4C88C" />
      <path d="M-6 640 C20 626 60 620 100 619" stroke="#FFF1CC" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.85} />
      <path d={grass([[0, 642, 22], [196, 642, 18], [20, 652, 14], [182, 652, 12]], 41)} fill="#4CAF50" />
      <HeroMat cx={102} cy={642} rx={52} ry={10} />
      <path d={grass([[40, 732, 20], [250, 724, 18], [372, 722, 22], [312, 728, 13]], 17)} fill="#2E8B47" />
      {/* foliage framing: a vignette made of leaves */}
      <Sway x={-14} y={870} seconds={5.5}>
        <path d={fan(-14, 870, 7, 170, 28, -95, -15, 31)} fill="#08331A" />
      </Sway>
      <path d={fan(404, 870, 7, 170, 28, -165, -85, 32)} fill="#08331A" />
      <path d={fan(-10, 860, 5, 112, 20, -80, -25, 33) + fan(400, 860, 5, 112, 20, -155, -100, 34)} fill="#167039" />
      <Sway x={404} y={-14} seconds={6.5} degrees={-3}>
        <path d={fan(404, -14, 6, 150, 26, 80, 165, 36)} fill="#03200F" />
      </Sway>
      <path d={fan(-14, -14, 6, 150, 26, 15, 100, 35)} fill="#03200F" />
      <path d={fan(-14, 440, 4, 96, 18, -40, 30, 37) + fan(404, 640, 4, 96, 18, 150, 220, 38)} fill="#0A3A1B" />
      <path d={fan(-14, 440, 3, 70, 13, -30, 20, 39)} fill="#155F31" />
    </>
  );
}

export const numboClearing: ArenaDef = {
  name: "Numbo's clearing",
  base: "#0A3A2C",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 330 }, owl: { x: 102, y: 642 } },
  motes: { color: "#FDE68A", glow: "rgba(250, 204, 21, 0.55)" },
};

/** Numbo's rock ledge, standing on (287, 326). Shared with the landscape arena. */
export function NumboLedge() {
  return (
    <>
      {/* Numbo's rock ledge */}
      <path d={blobs([[340, 300, 40], [388, 286, 46], [262, 304, 30]])} fill="#11522A" />
      <path d={fan(358, 318, 6, 72, 13, -150, -40, 8)} fill="#1F7A3D" />
      <ellipse cx={287} cy={400} rx={92} ry={12} fill="#000000" opacity={0.3} />
      <path d="M178 334 C180 318 222 308 287 308 C352 308 394 318 396 334 C396 358 380 374 350 384 C304 398 252 396 214 384 C190 376 178 360 178 334Z" fill="#8A6538" />
      <path d="M190 356 C214 376 256 384 290 384 C330 384 362 376 384 356 C376 372 350 386 304 394 C256 398 214 384 190 356Z" fill="#6E4E2A" />
      <ellipse cx={287} cy={326} rx={108} ry={19} fill="#D6B97F" />
      <ellipse cx={280} cy={322} rx={88} ry={11} fill="#ECD8AC" />
      <path d="M182 332 C200 318 240 312 270 311" stroke="#FFF4D6" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.8} />
      <path d="M214 348 L226 362 L222 374 M330 352 L322 366 M262 362 L270 378" stroke="#5E4022" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <path d="M200 360 C198 380 206 394 202 412 M372 356 C376 372 370 388 376 402" stroke="#1F6B35" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <path d={grass([[190, 330, 16], [382, 326, 18], [206, 340, 12], [366, 342, 13]], 11)} fill="#4CAF50" />
      <path d={fan(182, 340, 4, 40, 8, 100, 190, 12) + fan(392, 336, 4, 40, 8, -10, 80, 13)} fill="#2E8B47" />
    </>
  );
}

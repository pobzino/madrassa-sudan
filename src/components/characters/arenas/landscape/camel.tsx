import { HarfiLedge } from "../camelDesert";
import { meroe, Pool, Sky, Sway } from "../common";
import { blobs, dots, fan } from "../shapes";
import type { ArenaLayers } from "../types";
import { HeroMound, L_BOSS, L_OWL, Scaled } from "./kit";

/** Harfi's desert by the pyramids of Meroë, widescreen: pyramid fields on both sides, the low sun behind Harfi. */

const PYRAMIDS = [
  meroe(80, 620, 70, 160),
  meroe(160, 626, 58, 124),
  meroe(230, 630, 44, 92),
  meroe(380, 624, 52, 112),
  meroe(1000, 622, 48, 104),
  meroe(1280, 620, 72, 164),
  meroe(1360, 626, 54, 118),
];

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#24427E"], [0.3, "#5C66A8"], [0.55, "#B48BB0"], [0.68, "#F2B58A"]]} width={1460} height={910} />
      <path d={dots(50, 0, 10, 1440, 280, 0.9, 1.8, 5)} fill="#FFFFFF" opacity={0.7} />
      <path d="M210 120 a36 36 0 1 0 32 48 a28 28 0 1 1 -32 -48Z" fill="#FFF3D0" />
      <Pool id={`${uid}-sun`} cx={L_BOSS.x} cy={500} rx={460} ry={380} color="#FFD68A" strength={0.7} />
      <circle cx={1120} cy={560} r={70} fill="#FFE2A6" opacity={0.85} />
      <path d="M-10 630 C200 600 420 606 720 620 C1000 632 1240 604 1450 612 V760 H-10Z" fill="#B9849A" />
      {PYRAMIDS.map((p, i) => (
        <g key={i}>
          <path d={p.pyr} fill="#8A5F72" />
          <path d={p.shade} fill="#6E4A62" />
          <path d={p.porch} fill="#7A526A" />
        </g>
      ))}
      <path d="M-10 656 C260 632 520 640 800 652 C1060 662 1260 644 1450 648 V780 H-10Z" fill="#C99A8A" />
    </>
  );
}

function Mid() {
  return (
    <>
      <path d="M-10 690 C300 664 640 676 960 690 C1180 700 1320 684 1450 680 V900 H-10Z" fill="#D9A066" />
      <path d="M-10 750 C320 730 700 740 1000 754 C1220 764 1340 752 1450 748 V900 H-10Z" fill="#E2AE70" />
      <path d="M60 760 C54 680 64 600 88 540" stroke="#7A5232" strokeWidth={13} strokeLinecap="round" fill="none" />
      <Sway x={88} y={540} seconds={6} degrees={2.5}>
        <path d={fan(88, 540, 8, 110, 18, -175, -5, 61)} fill="#2F6B33" />
        <path d={blobs([[82, 552, 8], [94, 554, 8], [88, 564, 8]])} fill="#B8662C" />
      </Sway>
      <Scaled at={L_BOSS} from={[287, 328]}>
        <HarfiLedge />
      </Scaled>
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
      <path d="M-10 826 C300 800 700 804 1000 818 C1200 826 1340 818 1450 810 V910 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d="M600 852 Q680 840 760 852 M860 876 Q960 864 1060 876 M700 896 Q780 886 860 896" stroke="#C98A44" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.6} />
      <HeroMound id={`${uid}-hero`} cx={L_OWL.x} top={L_OWL.y} c={{ side: "#E9B46C", sideDark: "#CF9450", top: "#F2C882", topLight: "#F8D9A0", rim: "#FFF4D8", light: "#FFE2A3" }} />
      {/* framing: palm fronds above, desert shrubs below */}
      <Sway x={-20} y={-30} seconds={6.5}>
        <path d={fan(-20, -30, 7, 260, 32, 8, 95, 71)} fill="#1F4A26" />
      </Sway>
      <path d={fan(1460, -30, 7, 260, 32, 85, 172, 72)} fill="#1F4A26" />
      <path d={fan(-20, -30, 4, 180, 24, 25, 80, 73) + fan(1460, -30, 4, 180, 24, 100, 155, 74)} fill="#2F6B33" />
      <path d={blobs([[-10, 880, 70], [70, 910, 60], [1440, 880, 74], [1370, 912, 56]])} fill="#6E7A2E" />
      <path d={fan(-20, 920, 7, 170, 20, -90, -18, 75) + fan(1460, 920, 7, 170, 20, -162, -90, 76)} fill="#4F5E22" />
    </>
  );
}

export const camelLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: L_OWL },
};

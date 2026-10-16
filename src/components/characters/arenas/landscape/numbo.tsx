import { Pool, Sky } from "../common";
import { NumboLedge } from "../numboClearing";
import { blobs, canopy, dots, fan, grass, leaf } from "../shapes";
import type { ArenaLayers } from "../types";
import { EdgeFoliage, HeroMound, L_BOSS, L_OWL, Scaled } from "./kit";

/** Numbo's jungle clearing, widescreen: cave wall and light behind Numbo on the right, the owl's mound on the left. */

const NUM = "var(--font-fredoka), Fredoka, sans-serif";

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#03211A"], [0.45, "#0A3A2C"], [1, "#0F4A33"]]} width={1460} height={910} />
      <path d="M70 0H96L108 640H58Z M210 0H222L230 600H200Z M520 0H534L542 520H512Z M900 0H912L920 520H892Z M1380 0H1404L1414 640H1370Z" fill="#0D4030" opacity={0.7} />
      {/* the cave wall behind Numbo, with worn numbers */}
      <path d="M820 640 C800 470 860 290 1000 230 C1120 180 1300 190 1460 260 V640Z" fill="#0B3528" />
      <text x={880} y={420} fontSize={110} fontWeight={700} fill="#104536" fontFamily={NUM} transform="rotate(-8 920 380)">7</text>
      <text x={1300} y={360} fontSize={80} fontWeight={700} fill="#0E4232" fontFamily={NUM}>÷</text>
      <text x={150} y={420} fontSize={120} fontWeight={700} fill="#0E4232" fontFamily={NUM} transform="rotate(10 200 380)">3</text>
      <text x={330} y={230} fontSize={70} fontWeight={700} fill="#0E4232" fontFamily={NUM}>+</text>
      <path d="M960 -10 H1050 L1220 640 H1000Z M1080 -10 H1120 L1300 520 H1210Z" fill="#FFF3C4" opacity={0.06} />
      <Pool id={`${uid}-pool`} cx={L_BOSS.x} cy={460} rx={430} ry={360} color="#FBE7A1" strength={0.6} />
      <path d={`${blobs([[40, 20, 70], [180, 0, 64], [330, 18, 50], [520, -10, 56], [700, 10, 48], [880, -6, 60], [1060, 14, 52], [1240, -4, 66], [1400, 18, 70]])}M-10 -10H1450V12H-10Z`} fill="#021A12" />
      <path d={canopy(-40, 1480, 610, 44, 900, 4)} fill="#0C3D29" />
      <path d={canopy(-40, 1480, 650, 34, 900, 9, 0.8)} fill="#11492F" />
    </>
  );
}

function Mid() {
  return (
    <>
      <path d="M150 -4 C166 80 130 170 152 280 M330 -4 C318 60 344 120 330 180 M1250 -4 C1236 70 1270 130 1252 220" stroke="#0E4422" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d={leaf(152, 90, 22, 7, 30) + leaf(144, 160, 24, 7, 160) + leaf(152, 230, 22, 7, 20) + leaf(332, 100, 20, 6, 150) + leaf(1252, 90, 22, 6, 160) + leaf(1256, 160, 22, 7, 20)} fill="#17643A" />
      {/* the clearing floor: wide and calm for moves and the question */}
      <ellipse cx={720} cy={760} rx={860} ry={170} fill="#1B5A2E" />
      <ellipse cx={720} cy={730} rx={520} ry={80} fill="#245F30" opacity={0.8} />
      <path d={blobs([[-20, 640, 80], [80, 670, 60], [10, 720, 60]])} fill="#11522A" />
      <path d={fan(20, 720, 6, 130, 22, -80, 5, 2)} fill="#1D7038" />
      <path d="M560 740 C558 724 600 718 610 734 C614 746 562 750 560 740Z M860 760 C858 744 900 738 912 752 C916 766 862 770 860 760Z" fill="#2F4A3C" opacity={0.8} />
      <Scaled at={L_BOSS} from={[287, 326]}>
        <NumboLedge />
      </Scaled>
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
      </defs>
      <path d="M-10 830 C300 800 600 808 900 822 C1100 832 1300 820 1450 810 V910 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d={dots(18, 500, 840, 1300, 900, 1.8, 4, 21)} fill="#B88A4E" />
      <HeroMound id={`${uid}-hero`} cx={L_OWL.x} top={L_OWL.y} c={{ side: "#9C7443", sideDark: "#7A5530", top: "#C9A464", topLight: "#E4C88C", rim: "#FFF1CC", grass: "#4CAF50", light: "#FFE7A3" }} />
      <path d={grass([[560, 828, 22], [940, 826, 20], [1180, 818, 24]], 17)} fill="#2E8B47" />
      <EdgeFoliage dark="#08331A" mid="#167039" top="#03200F" seed={31} />
    </>
  );
}

export const numboLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: L_OWL },
};

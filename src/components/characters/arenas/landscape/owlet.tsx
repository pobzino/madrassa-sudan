import { HeroMat, Pool, Sky, Sway } from "../common";
import { House, OwletLedge } from "../owletVillage";
import { blobs, dots, fan, triangleBand } from "../shapes";
import type { ArenaLayers } from "../types";
import { L_BOSS, L_OWL, Scaled } from "./kit";

/** Puzzle Owlet's Nubian village at dusk, widescreen: painted houses along the back, the owlet on a rooftop. */

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#1E1446"], [0.4, "#4A2C78"], [0.62, "#B0588A"], [0.74, "#F29A6A"]]} width={1460} height={910} />
      <path d={dots(56, 0, 10, 1440, 360, 0.8, 1.8, 41)} fill="#FFFFFF" opacity={0.75} />
      <path d="M220 110 a34 34 0 1 0 30 46 a26 26 0 1 1 -30 -46Z" fill="#FFF3D0" />
      <Pool id={`${uid}-glow`} cx={L_BOSS.x} cy={470} rx={420} ry={360} color="#FFC98A" strength={0.6} />
      <path d="M-10 610 C200 560 400 576 600 600 C800 570 1100 566 1450 596 V720 H-10Z" fill="#3C2A66" />
      <path d="M140 620 V586 a24 24 0 1 1 48 0 V620Z M520 626 V600 a18 18 0 1 1 36 0 V626Z M760 622 V590 a22 22 0 1 1 44 0 V622Z" fill="#4A3678" />
      {/* a dim row of village houses along the back, for depth */}
      <path d="M360 690 V610 H470 V690Z M480 690 V630 H600 V690Z M620 690 V600 H720 V690Z M730 690 V624 H850 V690Z M860 690 V612 H950 V690Z" fill="#5A3E7A" />
      <path d="M404 690 V662 a11 11 0 0 1 22 0 V690Z M528 690 V666 a10 10 0 0 1 20 0 V690Z M660 690 V660 a11 11 0 0 1 22 0 V690Z M780 690 V664 a10 10 0 0 1 20 0 V690Z M894 690 V662 a10 10 0 0 1 20 0 V690Z" fill="#3C2A66" />
      <path d="M360 616 H470 M480 636 H600 M620 606 H720 M730 630 H850 M860 618 H950" stroke="#7A5E98" strokeWidth={4} />
    </>
  );
}

function Mid() {
  return (
    <>
      <path d="M-10 680 H1450 V900 H-10Z" fill="#8A5A52" />
      <path d="M-10 740 H1450 V900 H-10Z" fill="#9A6A58" />
      <g opacity={0.8}>
        <House x={-10} y={560} w={170} h={124} wall="#4E86C7" trim="#F5B324" door="#7A3E12" />
        <House x={180} y={590} w={150} h={94} wall="#F3E3BF" trim="#007229" door="#2F6FB0" />
      </g>
      <Scaled at={L_BOSS} from={[287, 332]}>
        <OwletLedge />
      </Scaled>
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  const cx = L_OWL.x;
  const t = L_OWL.y;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0C890" />
          <stop offset="1" stopColor="#D69A5A" />
        </linearGradient>
      </defs>
      <path d="M-10 822 H1450 V910 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d="M640 840 l18 12 l-18 12 l-18 -12Z M760 870 l18 12 l-18 12 l-18 -12Z M880 840 l18 12 l-18 12 l-18 -12Z M1000 870 l18 12 l-18 12 l-18 -12Z" fill="#C9844A" opacity={0.6} />
      {/* the owl's painted mud-brick bench (mastaba) */}
      <Pool id={`${uid}-hero`} cx={cx} cy={t - 50} rx={300} ry={250} color="#FFD9A0" strength={0.6} />
      <ellipse cx={cx} cy={t + 128} rx={200} ry={14} fill="#000000" opacity={0.25} />
      <path d={`M${cx - 190} ${t + 6} H${cx + 190} V${t + 124} H${cx - 190}Z`} fill="#C9844A" />
      <path d={`M${cx - 190} ${t + 72} H${cx + 190} V${t + 124} H${cx - 190}Z`} fill="#B0703C" />
      {triangleBand(cx - 186, cx + 186, t + 56, 16, ["#4E86C7", "#FFFFFF", "#F5B324"]).map((tri) => (
        <path key={tri.fill} d={tri.d} fill={tri.fill} />
      ))}
      <path d={`M${cx - 196} ${t - 12} H${cx + 190} a8 8 0 0 1 8 8 V${t + 12} H${cx - 196}Z`} fill="#E6B07A" />
      <path d={`M${cx - 188} ${t - 6} H${cx + 60}`} stroke="#FFF1D6" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
      <HeroMat cx={cx} cy={t + 2} rx={76} ry={13} />
      {/* framing: palms and bougainvillea on both edges */}
      <Sway x={-20} y={-30} seconds={6.5}>
        <path d={fan(-20, -30, 7, 260, 32, 8, 95, 111)} fill="#163A2A" />
      </Sway>
      <path d={fan(1460, -30, 7, 260, 32, 85, 172, 112)} fill="#163A2A" />
      <path d={blobs([[-10, 870, 70], [60, 906, 60], [1440, 870, 74], [1380, 906, 56], [-20, 520, 60], [1460, 480, 60]])} fill="#1F5A3A" />
      <path d={blobs([[20, 840, 10], [56, 862, 9], [8, 890, 9], [44, 896, 10], [1420, 846, 10], [1392, 870, 9], [1436, 892, 10], [10, 500, 9], [30, 540, 8], [1430, 470, 9], [1410, 510, 8], [100, 18, 9], [130, 46, 8], [1330, 26, 9], [1300, 52, 8]])} fill="#E85A9A" />
    </>
  );
}

export const owletLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: L_OWL },
};

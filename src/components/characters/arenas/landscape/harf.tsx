import { HeroMat, Pool, Sky, Sway } from "../common";
import { HarfLedge, scrolls, spines } from "../harfLibrary";
import { dots, fan } from "../shapes";
import type { ArenaLayers } from "../types";
import { L_BOSS, L_OWL, Scaled } from "./kit";

/** Harf's scroll library, widescreen: tall arched windows and shelves, lanterns, a rug, the owl on a stack of giant books. */

function Arch({ x, w, top, bottom }: { x: number; w: number; top: number; bottom: number }) {
  const h = w / 2;
  return (
    <g>
      <path d={`M${x - h} ${bottom} V${top + h} C${x - h} ${top + h * 0.3} ${x - h * 0.4} ${top} ${x} ${top - h * 0.3} C${x + h * 0.4} ${top} ${x + h} ${top + h * 0.3} ${x + h} ${top + h} V${bottom}Z`} fill="#2E2C61" />
      <path d={`M${x - h + 10} ${bottom - 8} V${top + h} C${x - h + 10} ${top + h * 0.4} ${x - h * 0.3} ${top + 14} ${x} ${top - h * 0.3 + 18} C${x + h * 0.3} ${top + 14} ${x + h - 10} ${top + h * 0.4} ${x + h - 10} ${top + h} V${bottom - 8}Z`} fill="#203F78" />
      <path d={`M${x} ${top - h * 0.3 + 18} V${bottom - 8} M${x - h + 10} ${(top + bottom) / 2 + 30} H${x + h - 10}`} stroke="#2E2C61" strokeWidth={6} />
    </g>
  );
}

function Back({ uid }: { uid: string }) {
  const shelfL = spines(-10, 300, 360, 34, 54, ["#2C2A5C", "#363269", "#2A3A63"], 3).concat(spines(-10, 300, 500, 34, 54, ["#2C2A5C", "#3A3070", "#2A3A63"], 4));
  const shelfR = spines(1180, 1450, 360, 34, 54, ["#2C2A5C", "#363269", "#2A3A63"], 6).concat(spines(1180, 1450, 500, 34, 54, ["#2C2A5C", "#3A3070", "#2A3A63"], 7));
  return (
    <>
      <Sky id={`${uid}-wall`} stops={[[0, "#0F1330"], [0.55, "#1B1F47"], [1, "#272554"]]} width={1460} height={910} />
      <Arch x={560} w={150} top={150} bottom={560} />
      <Arch x={880} w={150} top={150} bottom={560} />
      <path d={dots(16, 500, 170, 940, 420, 1, 2, 8)} fill="#FFFFFF" opacity={0.7} />
      <path d="M906 210 a20 20 0 1 0 18 28 a15 15 0 1 1 -18 -28Z" fill="#FFF3D0" />
      <path d="M-10 230 H310 V590 H-10Z M1170 230 H1450 V590 H1170Z" fill="#1E1A40" />
      {shelfL.concat(shelfR).map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} />
      ))}
      <path d="M-10 360 H310 M-10 500 H310 M1170 360 H1450 M1170 500 H1450" stroke="#3B2A4A" strokeWidth={8} />
      <Pool id={`${uid}-glow`} cx={L_BOSS.x} cy={470} rx={420} ry={360} color="#FFC870" strength={0.55} />
      <path d="M-10 590 H1450 V910 H-10Z" fill="#2B1E2E" />
    </>
  );
}

function Mid({ uid }: { uid: string }) {
  const s = scrolls(80, 690, 4, 5);
  return (
    <>
      <path d="M-10 600 H1450 V900 H-10Z" fill="#4A2E24" />
      <path d="M-10 650 H1450 M-10 720 H1450 M-10 800 H1450" stroke="#3E261E" strokeWidth={4} />
      <path d="M-10 560 H170 V700 H-10Z" fill="#5A3A22" />
      <path d="M-10 566 H164 V694 H-10Z" fill="#3A2416" />
      <path d={s.ends} fill="#F3E3BF" />
      <path d={s.cores} fill="#C9A86A" />
      {[220, 1280].map((x, i) => (
        <Sway key={x} x={x} y={-10} seconds={4.5 + i} degrees={3}>
          <path d={`M${x} -10 V130`} stroke="#8A6A3A" strokeWidth={3} />
          <Pool id={`${uid}-lamp${i}`} cx={x} cy={170} rx={90} ry={90} color="#FFC870" strength={0.6} />
          <path d={`M${x - 18} 134 H${x + 18} L${x + 27} 164 L${x + 12} 196 H${x - 12} L${x - 27} 164Z`} fill="#E39A10" />
          <path d={`M${x - 12} 142 H${x + 12} L${x + 18} 164 L${x + 8} 186 H${x - 8} L${x - 18} 164Z`} fill="#FFE08A" />
        </Sway>
      ))}
      <Scaled at={L_BOSS} from={[287, 326]}>
        <HarfLedge />
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
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9A6436" />
          <stop offset="1" stopColor="#6E4425" />
        </linearGradient>
      </defs>
      <path d="M-10 820 H1450 V910 H-10Z" fill={`url(#${uid}-wood)`} />
      <path d="M520 836 H1180 L1220 910 H480Z" fill="#B3122E" />
      <path d="M528 846 H1172 M500 896 H1200" stroke="#F5B324" strokeWidth={4} />
      {/* the owl's stack of giant books */}
      <Pool id={`${uid}-hero`} cx={cx} cy={t - 50} rx={300} ry={250} color="#FFD98A" strength={0.55} />
      <ellipse cx={cx} cy={t + 128} rx={190} ry={14} fill="#000000" opacity={0.3} />
      <rect x={cx - 190} y={t + 60} width={380} height={64} rx={10} fill="#1F4E8C" />
      <rect x={cx + 156} y={t + 64} width={30} height={56} fill="#F3E3BF" />
      <path d={`M${cx - 180} ${t + 92} H${cx + 150}`} stroke="#F5B324" strokeWidth={4} />
      <rect x={cx - 170} y={t + 12} width={340} height={52} rx={10} fill="#E39A10" />
      <rect x={cx - 170} y={t + 16} width={28} height={44} fill="#F3E3BF" />
      <path d={`M${cx - 130} ${t + 38} H${cx + 160}`} stroke="#8A4A08" strokeWidth={3.4} />
      <path d={`M${cx - 176} ${t + 2} C${cx - 150} ${t - 16} ${cx + 150} ${t - 16} ${cx + 176} ${t + 2} V${t + 16} H${cx - 176}Z`} fill="#F5B324" />
      <path d={`M${cx - 160} ${t - 6} C${cx - 100} ${t - 14} ${cx - 40} ${t - 15} ${cx + 10} ${t - 15}`} stroke="#FFF1C2" strokeWidth={3} strokeLinecap="round" opacity={0.9} />
      <HeroMat cx={cx} cy={t + 2} rx={76} ry={13} />
      {/* framing: heavy drapes, potted palms */}
      <Sway x={-10} y={-10} seconds={7} degrees={1.5}>
        <path d="M-10 -10 H150 C120 100 80 260 60 470 C44 510 10 518 -10 510Z" fill="#6E0F22" />
        <path d="M100 -10 C84 110 50 280 40 470" stroke="#8E1A30" strokeWidth={8} fill="none" />
      </Sway>
      <path d="M1450 -10 H1290 C1320 100 1360 260 1380 470 C1396 510 1430 518 1450 510Z" fill="#6E0F22" />
      <path d="M-10 -10 H1450 V30 H-10Z" fill="#4A0A17" />
      <path d="M-10 30 H1450" stroke="#F5B324" strokeWidth={4} />
      <path d={fan(1400, 900, 8, 210, 28, -170, -80, 81) + fan(40, 900, 7, 200, 26, -100, -10, 84)} fill="#14502A" />
      <path d={fan(1400, 900, 4, 140, 20, -160, -100, 82) + fan(40, 900, 4, 130, 18, -80, -30, 85)} fill="#1E6B38" />
      <path d="M1350 910 L1366 846 H1450 V910Z M-10 910 V846 H90 L74 910Z" fill="#B36A32" />
    </>
  );
}

export const harfLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: { x: L_OWL.x, y: L_OWL.y + 2 } },
};

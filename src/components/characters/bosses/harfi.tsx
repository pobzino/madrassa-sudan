import { Brows, HandGlow, Dust, Eyes, Hand, lidPivots, Mouths, Rim, ShadeDefs, Sparkles, Stars, Steam, Tile, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/**
 * Harfi the Letter Camel: a sandy chibi camel with a woven Sudanese saddle
 * cloth over its hump and a tasselled halter, holding a letter tile.
 */

const C = {
  main: ["#E2AE6C", "#EE8A4A"],
  dark: ["#C98A45", "#C9632E"],
  light: ["#F7DDB5", "#FFD2B0"],
  muzzle: ["#F3CF9C", "#FFC09A"],
  brow: ["#8F5A26", "#7A2E12"],
} as const;
const INK = "#3B2410";
const HOOF = "#7A4A1F";

const EYES = {
  l: [82, 84],
  r: [118, 84],
  rx: 12.5,
  ry: 14,
  pupil: 7.6,
  look: [-2, 2.5],
  ink: INK,
  lid: { tint: "main", color: C.main[0] },
} as const;

function Art({ uid }: { uid: string }) {
  return (
    <>
      <ShadeDefs uid={uid} />
      <ellipse data-part="shadow" cx={100} cy={190} rx={66} ry={9} fill={`url(#${uid}-ground)`} />
      <Dust ground={190} xs={[64, 136, 40, 160]} />
      <g data-part="move">
        <g data-part="root">
          <g data-part="tail">
            <path d="M150 160 C164 164 170 176 166 186" stroke={C.dark[0]} data-tint-stroke="dark" strokeWidth={5} strokeLinecap="round" fill="none" />
            <ellipse cx={166} cy={188} rx={5} ry={7} fill={HOOF} />
          </g>
          <g data-part="footL">
            <rect x={58} y={150} width={24} height={36} rx={11} fill={C.main[0]} data-tint="main" />
            <ellipse cx={70} cy={184} rx={14} ry={7} fill={HOOF} />
          </g>
          <g data-part="footR">
            <rect x={118} y={150} width={24} height={36} rx={11} fill={C.main[0]} data-tint="main" />
            <ellipse cx={130} cy={184} rx={14} ry={7} fill={HOOF} />
          </g>
          <g data-part="body">
            {/* the hump, under a woven saddle cloth */}
            <ellipse cx={146} cy={110} rx={38} ry={36} fill={C.main[0]} data-tint="main" />
            <ellipse cx={146} cy={110} rx={38} ry={36} fill={`url(#${uid}-shade)`} />
            <path d="M116 122 C118 100 170 98 180 120 L182 140 L114 140Z" fill="#D21034" />
            <path d="M120 140 l4 -7 l4 7Z M136 140 l4 -7 l4 7Z M152 140 l4 -7 l4 7Z M168 140 l4 -7 l4 7Z" fill="#1a1a1a" />
            <path d="M128 140 l4 -7 l4 7Z M144 140 l4 -7 l4 7Z M160 140 l4 -7 l4 7Z" fill="#007229" />
            <path d="M118 140 v8 M134 140 v9 M150 140 v8 M166 140 v9 M180 140 v7" stroke="#F59E0B" strokeWidth={3} strokeLinecap="round" />
            <ellipse cx={100} cy={152} rx={56} ry={36} fill={C.main[0]} data-tint="main" />
            <ellipse cx={100} cy={164} rx={34} ry={20} fill={C.light[0]} data-tint="light" />
            <ellipse cx={100} cy={152} rx={56} ry={36} fill={`url(#${uid}-shade)`} />
            <ellipse data-part="flash" cx={100} cy={120} rx={60} ry={70} fill="#FFFFFF" opacity={0} />
            <g data-part="head">
              <g transform="translate(-8 0)">
              <g data-part="earL">
                <ellipse cx={54} cy={70} rx={9} ry={15} fill={C.main[0]} data-tint="main" transform="rotate(-50 54 70)" />
                <ellipse cx={55} cy={71} rx={4} ry={9} fill={C.dark[0]} data-tint="dark" transform="rotate(-50 55 71)" />
              </g>
              <g data-part="earR">
                <ellipse cx={146} cy={70} rx={9} ry={15} fill={C.main[0]} data-tint="main" transform="rotate(50 146 70)" />
                <ellipse cx={145} cy={71} rx={4} ry={9} fill={C.dark[0]} data-tint="dark" transform="rotate(50 145 71)" />
              </g>
              <ellipse cx={100} cy={88} rx={47} ry={41} fill={C.main[0]} data-tint="main" />
              <ellipse cx={100} cy={88} rx={47} ry={41} fill={`url(#${uid}-shade)`} />
              <Rim cx={100} cy={88} rx={47} ry={41} from={205} to={300} width={3} opacity={0.45} />
              <ellipse data-part="flash" cx={100} cy={88} rx={47} ry={41} fill="#FFFFFF" opacity={0} />
              <g data-part="tuft">
                <path d="M84 52 a8 8 0 0 1 12 -8 a9 9 0 0 1 14 2 a7 7 0 0 1 4 10 Q100 50 84 52Z" fill={C.dark[0]} data-tint="dark" />
              </g>
              <ellipse cx={100} cy={116} rx={29} ry={24} fill={C.muzzle[0]} data-tint="muzzle" />
              <path d="M86 106 q4 -4 8 0 M106 106 q4 -4 8 0" stroke={C.brow[0]} data-tint-stroke="brow" strokeWidth={2.6} strokeLinecap="round" fill="none" />
              <path d="M56 98 a8 5 0 1 0 16 0 a8 5 0 1 0 -16 0Z M128 98 a8 5 0 1 0 16 0 a8 5 0 1 0 -16 0Z" fill="#FF9FB2" opacity={0.75} />
              <Eyes e={EYES} uid={uid} />
              {/* long lashes */}
              <path d="M70 78 l-5 -3 M72 73 l-4 -5 M130 78 l5 -3 M128 73 l4 -5" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
              <Brows b={{ l: [82, 62], r: [118, 62], len: 13, width: 3.6, color: C.brow[0], tint: "brow" }} />
              {/* tasselled halter, Sudanese colours */}
              <path d="M66 100 Q100 92 134 100" stroke="#D21034" strokeWidth={4} strokeLinecap="round" fill="none" />
              <path d="M61.5 100 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0Z M129.5 100 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0Z" fill="#FFC83D" />
              <path d="M66 105 l-2 9 M134 105 l2 9" stroke="#007229" strokeWidth={3.2} strokeLinecap="round" />
              <Mouths m={{ at: [100, 125], scale: 0.55, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[50, 50], [150, 50]]} />
              </g>
            </g>
            <g data-part="armR">
              <HandGlow uid={uid} cx={100} cy={158} />
              <g data-part="prop">
                <Tile cx={100} cy={158} glyph="ح" face="#FFE9A8" edge="#E39A10" ink="#7A3E12" arabic />
              </g>
              <Hand cx={122} cy={160} color={C.dark[0]} />
            </g>
            <g data-part="armL">
              <Hand cx={78} cy={160} color={C.dark[0]} />
            </g>
          </g>
          <Sparkles at={[[24, 110, 1], [178, 50, 1.3], [180, 150, 0.8]]} />
          <Zzz at={[150, 40]} />
        </g>
      </g>
    </>
  );
}

export const harfi: BossDef = {
  name: "Harfi",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 126],
      earL: [62, 76],
      earR: [138, 76],
      tuft: [100, 52],
      tail: [150, 160],
      armL: [46, 128],
      armR: [154, 128],
      prop: [100, 158],
      footL: [70, 186],
      footR: [130, 186],
      flash: [100, 120],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 32, rx: 54, ry: 11 },
    tints: C,
    poses: {
      // Camels look gently sleepy: a touch of lid even when idle.
      idle: { lids: 0.16 },
    },
  }),
};

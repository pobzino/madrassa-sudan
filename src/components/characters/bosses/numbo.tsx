import { Brows, HandGlow, Dust, Eyes, lidPivots, Mouths, Rim, ShadeDefs, Sparkles, Stars, Steam, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/** Numbo the Number Giant: a round purple bear-giant hugging a gold "?" coin. */

const C = {
  main: ["#8B7CF6", "#F08A5D"],
  dark: ["#6D5BD0", "#D9663A"],
  light: ["#D9D2FF", "#FFD6BF"],
  inner: ["#C9C0FF", "#FFC6A8"],
  brow: ["#4B3BA8", "#8A3A17"],
} as const;
const INK = "#2B2A4C";

const EYES = {
  l: [78, 100],
  r: [122, 100],
  rx: 14.5,
  ry: 16,
  pupil: 8.6,
  look: [-2.5, 3],
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
          <g data-part="head">
            <g data-part="earL">
              <circle cx={50} cy={58} r={17} fill={C.main[0]} data-tint="main" />
              <circle cx={50} cy={58} r={9} fill={C.inner[0]} data-tint="inner" />
            </g>
            <g data-part="earR">
              <circle cx={150} cy={58} r={17} fill={C.main[0]} data-tint="main" />
              <circle cx={150} cy={58} r={9} fill={C.inner[0]} data-tint="inner" />
            </g>
            <g data-part="tuft">
              <path
                d="M100 50 C 94 32, 118 22, 116 38 C 115 44, 106 42, 108 36"
                stroke={C.main[0]}
                data-tint-stroke="main"
                strokeWidth={7}
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </g>
          <g data-part="body">
            <ellipse cx={100} cy={116} rx={73} ry={70} fill={C.main[0]} data-tint="main" />
            <ellipse cx={100} cy={146} rx={47} ry={38} fill={C.light[0]} data-tint="light" />
            <ellipse cx={100} cy={116} rx={73} ry={70} fill={`url(#${uid}-shade)`} />
            <Rim cx={100} cy={116} rx={73} ry={70} from={205} to={300} width={3.5} opacity={0.45} />
            <ellipse data-part="flash" cx={100} cy={116} rx={74} ry={71} fill="#FFFFFF" opacity={0} />
            <g data-part="head">
              <ellipse cx={58} cy={124} rx={11} ry={7} fill="#FF9FB2" opacity={0.85} />
              <ellipse cx={142} cy={124} rx={11} ry={7} fill="#FF9FB2" opacity={0.85} />
              <Eyes e={EYES} uid={uid} />
              <Brows b={{ l: [77, 76], r: [123, 76], len: 15, width: 4, color: C.brow[0], tint: "brow" }} />
              <ellipse cx={100} cy={119} rx={6} ry={4.4} fill={INK} />
              <ellipse cx={98.5} cy={117.6} rx={2} ry={1.2} fill="#FFFFFF" opacity={0.6} />
              <Mouths m={{ at: [100, 130], scale: 0.62, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[50, 34], [150, 34]]} />
            </g>
            <g data-part="armR">
              <HandGlow uid={uid} cx={100} cy={158} />
              <g data-part="prop">
                <circle cx={100} cy={158} r={21} fill="#E39A10" />
                <circle cx={100} cy={156.5} r={19} fill="#FFC83D" />
                <circle cx={100} cy={156.5} r={14.5} fill="#F5B324" />
                <text
                  x={100}
                  y={164}
                  textAnchor="middle"
                  fontSize={21}
                  fontWeight={700}
                  fill={INK}
                  fontFamily="var(--font-fredoka), Fredoka, sans-serif"
                >
                  ?
                </text>
                <ellipse cx={91} cy={146} rx={6} ry={3} fill="#FFFFFF" opacity={0.55} transform="rotate(-30 91 146)" />
              </g>
              <ellipse cx={122} cy={160} rx={11} ry={10} fill={C.dark[0]} data-tint="dark" />
              <ellipse cx={124} cy={156} rx={5} ry={3} fill="#FFFFFF" opacity={0.18} />
            </g>
            <g data-part="armL">
              <ellipse cx={78} cy={160} rx={11} ry={10} fill={C.dark[0]} data-tint="dark" />
              <ellipse cx={76} cy={156} rx={5} ry={3} fill="#FFFFFF" opacity={0.18} />
            </g>
          </g>
          <g data-part="footL">
            <ellipse cx={70} cy={181} rx={21} ry={11} fill={C.dark[0]} data-tint="dark" />
            <ellipse cx={66} cy={177} rx={10} ry={3.5} fill="#FFFFFF" opacity={0.16} />
          </g>
          <g data-part="footR">
            <ellipse cx={130} cy={181} rx={21} ry={11} fill={C.dark[0]} data-tint="dark" />
            <ellipse cx={126} cy={177} rx={10} ry={3.5} fill="#FFFFFF" opacity={0.16} />
          </g>
          <Sparkles at={[[26, 66, 1], [178, 50, 1.3], [174, 142, 0.8]]} />
          <Zzz at={[156, 44]} />
        </g>
      </g>
    </>
  );
}

export const numbo: BossDef = {
  name: "Numbo",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 128],
      earL: [56, 70],
      earR: [144, 70],
      tuft: [100, 50],
      armL: [46, 128],
      armR: [154, 128],
      prop: [100, 158],
      footL: [70, 182],
      footR: [130, 182],
      flash: [100, 116],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 34, rx: 58, ry: 12 },
    tints: C,
  }),
};

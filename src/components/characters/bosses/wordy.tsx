import { Brows, HandGlow, Dust, Eyes, Hand, lidPivots, Mouths, ShadeDefs, Sparkles, Stars, Steam, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/** Wordy the Word Dragon: a pear-shaped teal bookworm of a dragon, with round glasses, orange frills and an open book. */

const C = {
  main: ["#3FBFA0", "#F08A5D"],
  dark: ["#279C80", "#D9663A"],
  light: ["#FFE3C7", "#FFE6CC"],
  frill: ["#FF9F68", "#FFC83D"],
  brow: ["#1D7560", "#8A3A17"],
} as const;
const INK = "#173B33";

const BODY = "M100 44 C138 44 156 74 158 104 C164 128 172 150 166 170 C160 186 132 190 100 190 C68 190 40 186 34 170 C28 150 36 128 42 104 C44 74 62 44 100 44Z";
const FRILL_L = "M48 82 C30 72 16 80 12 92 C20 92 22 98 18 104 C26 104 30 110 28 118 C38 114 46 106 50 100Z";
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);

const EYES = {
  l: [82, 94],
  r: [118, 94],
  rx: 12.5,
  ry: 13.5,
  pupil: 7.4,
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
            <path d="M146 176 C172 188 194 176 192 156 C190 144 178 144 178 154" stroke={C.main[0]} data-tint-stroke="main" strokeWidth={14} strokeLinecap="round" fill="none" />
            <path d="M176 156 L170 146 L180 148 L182 138 L188 148Z" fill={C.frill[0]} data-tint="frill" />
          </g>
          <g data-part="earL">
            <path d={FRILL_L} fill={C.frill[0]} data-tint="frill" />
          </g>
          <g data-part="earR">
            <path d={mirror(FRILL_L)} fill={C.frill[0]} data-tint="frill" />
          </g>
          <g data-part="footL">
            <ellipse cx={72} cy={183} rx={20} ry={10} fill={C.dark[0]} data-tint="dark" />
          </g>
          <g data-part="footR">
            <ellipse cx={128} cy={183} rx={20} ry={10} fill={C.dark[0]} data-tint="dark" />
          </g>
          <g data-part="body">
            <path d={BODY} fill={C.main[0]} data-tint="main" />
            <ellipse cx={100} cy={152} rx={42} ry={34} fill={C.light[0]} data-tint="light" />
            <path d="M72 138 Q100 145 128 138 M66 152 Q100 160 134 152 M70 168 Q100 176 130 168" stroke="#F2C9A0" strokeWidth={2.2} strokeLinecap="round" fill="none" />
            <path d={BODY} fill={`url(#${uid}-shade)`} />
            <path d="M64 70 C74 54 90 47 104 46" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={3.4} strokeLinecap="round" fill="none" />
            <path data-part="flash" d={BODY} fill="#FFFFFF" opacity={0} />
            <g data-part="head">
              <g data-part="tuft">
                <ellipse cx={86} cy={46} rx={5} ry={8} fill="#FFC48A" transform="rotate(-18 86 46)" />
                <ellipse cx={114} cy={46} rx={5} ry={8} fill="#FFC48A" transform="rotate(18 114 46)" />
              </g>
              <ellipse cx={58} cy={118} rx={9} ry={6} fill="#FF9FB2" opacity={0.8} />
              <ellipse cx={142} cy={118} rx={9} ry={6} fill="#FF9FB2" opacity={0.8} />
              <Eyes e={EYES} uid={uid} />
              {/* round reading glasses */}
              <g fill="#FFFFFF" fillOpacity={0.12} stroke="#1E293B" strokeWidth={3.2}>
                <circle cx={82} cy={94} r={17} />
                <circle cx={118} cy={94} r={17} />
              </g>
              <path d="M98 92 Q100 88 102 92 M65 92 L56 88 M135 92 L144 88" stroke="#1E293B" strokeWidth={3} strokeLinecap="round" fill="none" />
              <Brows b={{ l: [82, 68], r: [118, 68], len: 14, width: 3.8, color: C.brow[0], tint: "brow" }} />
              <ellipse cx={95} cy={116} rx={2.4} ry={1.8} fill={INK} />
              <ellipse cx={105} cy={116} rx={2.4} ry={1.8} fill={INK} />
              <Mouths m={{ at: [100, 126], scale: 0.58, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[40, 72], [160, 72]]} />
            </g>
            <g data-part="armR">
              <HandGlow uid={uid} cx={100} cy={164} />
              <g data-part="prop">
                <path d="M68 148 L100 155 L132 148 L132 178 L100 185 L68 178Z" fill="#007229" />
                <path d="M71 146 Q86 143 100 151 L100 180 Q86 173 71 175Z" fill="#FFFDF5" />
                <path d="M129 146 Q114 143 100 151 L100 180 Q114 173 129 175Z" fill="#F4EEDD" />
                <path d="M76 153 L95 157 M76 159 L95 163 M76 165 L91 168 M105 157 L124 153 M105 163 L124 159 M109 168 L124 165" stroke="#94A3B8" strokeWidth={1.6} strokeLinecap="round" />
              </g>
              <Hand cx={128} cy={164} color={C.dark[0]} />
            </g>
            <g data-part="armL">
              <Hand cx={72} cy={164} color={C.dark[0]} />
            </g>
          </g>
          <Sparkles at={[[22, 130, 1], [180, 44, 1.3], [178, 118, 0.8]]} />
          <Zzz at={[152, 40]} />
        </g>
      </g>
    </>
  );
}

export const wordy: BossDef = {
  name: "Wordy",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 122],
      earL: [50, 96],
      earR: [150, 96],
      tuft: [100, 52],
      tail: [146, 176],
      armL: [42, 130],
      armR: [158, 130],
      prop: [100, 164],
      footL: [72, 183],
      footR: [128, 183],
      flash: [100, 118],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 30, rx: 56, ry: 11 },
    tints: C,
    propFly: { x: -90, y: 36, rotation: -200 },
  }),
};

import { HeroMat, Pool, Sky, Sway } from "./common";
import { blobs, dots, fan, triangleBand } from "./shapes";
import type { ArenaDef } from "./types";

/**
 * Puzzle Owlet's arena: a Nubian village at dusk. A cool violet sky over
 * painted houses with arched doors and geometric trim; the owlet perched on
 * a rooftop, the owl on a warm mud-brick bench in the courtyard.
 */

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#1E1446"], [0.35, "#4A2C78"], [0.55, "#B0588A"], [0.66, "#F29A6A"]]} />
      <path d={dots(24, 0, 10, 390, 260, 0.7, 1.6, 41)} fill="#FFFFFF" opacity={0.75} />
      <path d="M60 80 a22 22 0 1 0 20 30 a17 17 0 1 1 -20 -30Z" fill="#FFF3D0" />
      <Pool id={`${uid}-glow`} cx={287} cy={290} rx={210} ry={210} color="#FFC98A" strength={0.6} />
      {/* far hills and distant domes */}
      <path d="M-10 420 C60 380 130 390 190 410 C250 380 330 380 400 404 V520 H-10Z" fill="#3C2A66" />
      <path d="M40 430 V404 a16 16 0 0 1 32 0 V430Z M140 434 V414 a12 12 0 0 1 24 0 V434Z" fill="#4A3678" />
    </>
  );
}

function House({ x, y, w, h, wall, trim, door }: { x: number; y: number; w: number; h: number; wall: string; trim: string; door: string }) {
  const band = triangleBand(x + 4, x + w - 4, y + 16, 8, [trim, "#FFFFFF"]);
  return (
    <g>
      <path d={`M${x} ${y + h}V${y}H${x + w}V${y + h}Z`} fill={wall} />
      <path d={`M${x - 3} ${y}H${x + w + 3}V${y + 6}H${x - 3}Z`} fill="#F3E3BF" />
      {band.map((t) => (
        <path key={t.fill} d={t.d} fill={t.fill} />
      ))}
      <path d={`M${x + w / 2 - 12} ${y + h}V${y + h - 30}a12 12 0 0 1 24 0V${y + h}Z`} fill={door} />
      <path d={`M${x + w / 2 - 12} ${y + h - 30}a12 12 0 0 1 24 0`} stroke="#F3E3BF" strokeWidth={3} fill="none" />
    </g>
  );
}

function Mid() {
  return (
    <>
      {/* the courtyard, kept calm for the answer band */}
      <path d="M-10 480 H400 V720 H-10Z" fill="#8A5A52" />
      <path d="M-10 540 H400 V720 H-10Z" fill="#9A6A58" />
      <House x={-10} y={400} w={110} h={86} wall="#4E86C7" trim="#F5B324" door="#7A3E12" />
      {/* the owlet's rooftop */}
      <path d="M178 330 H396 V470 H178Z" fill="#E7B460" />
      <path d="M178 412 H396 V470 H178Z" fill="#A8743E" />
      <path d="M178 456 H396 V470 H178Z" fill="#7E5432" />
      <path d="M178 330 H396 V350 H178Z" fill="#F3E3BF" />
      {triangleBand(182, 394, 368, 12, ["#D21034", "#007229", "#1a1a1a"]).map((t) => (
        <path key={t.fill} d={t.d} fill={t.fill} />
      ))}
      <path d="M222 412 V390 a18 18 0 0 1 36 0 V412Z" fill="#2F6FB0" />
      <path d="M222 390 a18 18 0 0 1 36 0" stroke="#FFFFFF" strokeWidth={3.5} fill="none" />
      <path d="M318 382 h28 v24 h-28Z" fill="#7A3E12" />
      <path d="M318 382 h28 v24 h-28Z" stroke="#F3E3BF" strokeWidth={3} fill="none" />
      <path d="M332 382 V406 M318 394 H346" stroke="#F3E3BF" strokeWidth={2} />
      <path d="M182 336 C200 330 240 330 270 330" stroke="#FFF4D8" strokeWidth={2.4} strokeLinecap="round" opacity={0.8} />
      {/* a palm behind the roof */}
      <path d="M380 330 C376 290 380 250 392 220" stroke="#5E3A28" strokeWidth={8} strokeLinecap="round" fill="none" />
      <Sway x={392} y={220} seconds={6} degrees={2.5}>
        <path d={fan(392, 220, 7, 64, 11, -175, -5, 101)} fill="#235A3A" />
      </Sway>
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0C890" />
          <stop offset="1" stopColor="#D69A5A" />
        </linearGradient>
      </defs>
      <path d="M-10 736 H400 V860 H-10Z" fill={`url(#${uid}-sand)`} />
      <path d="M200 760 l14 10 l-14 10 l-14 -10Z M260 790 l14 10 l-14 10 l-14 -10Z M320 760 l14 10 l-14 10 l-14 -10Z M230 830 l14 10 l-14 10 l-14 -10Z" fill="#C9844A" opacity={0.6} />
      {/* the owl's painted mud-brick bench (mastaba) */}
      <Pool id={`${uid}-hero`} cx={104} cy={604} rx={170} ry={150} color="#FFD9A0" strength={0.6} />
      <path d="M-10 646 H214 V734 H-10Z" fill="#C9844A" />
      <path d="M-10 690 H214 V734 H-10Z" fill="#B0703C" />
      {triangleBand(-10, 214, 676, 12, ["#4E86C7", "#FFFFFF", "#F5B324"]).map((t) => (
        <path key={t.fill} d={t.d} fill={t.fill} />
      ))}
      <path d="M-10 632 H218 a6 6 0 0 1 6 6 V650 H-10Z" fill="#E6B07A" />
      <path d="M-6 636 H140" stroke="#FFF1D6" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
      <HeroMat cx={102} cy={642} rx={52} ry={9} />
      {/* framing: palm fronds and bougainvillea */}
      <Sway x={-10} y={-20} seconds={6.5}>
        <path d={fan(-10, -20, 6, 170, 22, 10, 95, 111)} fill="#163A2A" />
      </Sway>
      <path d={fan(400, -20, 6, 170, 22, 85, 170, 112)} fill="#163A2A" />
      <path d={blobs([[-6, 820, 40], [36, 846, 36], [388, 826, 44], [350, 852, 32]])} fill="#1F5A3A" />
      <path d={blobs([[10, 800, 7], [34, 814, 6], [-2, 830, 6], [22, 836, 7], [372, 806, 7], [354, 822, 6], [384, 836, 7], [396, 812, 6]])} fill="#E85A9A" />
      <path d={blobs([[60, 10, 6], [80, 30, 5], [330, 18, 6], [312, 36, 5]])} fill="#E85A9A" />
    </>
  );
}

export const owletVillage: ArenaDef = {
  name: "The Nubian village",
  base: "#4A2C78",
  Back,
  Mid,
  Floor,
  anchors: { boss: { x: 287, y: 332 }, owl: { x: 102, y: 642 } },
  motes: { color: "#FFE9B0", glow: "rgba(255, 201, 138, 0.55)" },
};

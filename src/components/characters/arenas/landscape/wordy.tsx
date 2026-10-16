import { Pool, Sky } from "../common";
import { blobs, canopy, dots, grass } from "../shapes";
import type { ArenaLayers } from "../types";
import { bookHill, WordyLedge } from "../wordyStoryland";
import { EdgeFoliage, HeroMound, L_BOSS, L_OWL, Scaled } from "./kit";

/** Wordy's Storyland, widescreen: book-stack hills under a dusk sky, drifting letters, Wordy on a giant open book. */

const LAT = "var(--font-fredoka), Fredoka, sans-serif";
const AR = "var(--font-cairo), Cairo, sans-serif";

function Back({ uid }: { uid: string }) {
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#1C1745"], [0.4, "#3A2F78"], [0.7, "#3E6C93"]]} width={1460} height={910} />
      <path d={dots(60, 0, 10, 1440, 380, 0.8, 2, 31)} fill="#FFFFFF" opacity={0.75} />
      <path d="M1180 110 a40 40 0 1 0 36 54 a31 31 0 1 1 -36 -54Z" fill="#FFF3D0" />
      <g fill="#7C83C9" opacity={0.5} fontWeight={700}>
        <text x={160} y={200} fontSize={52} fontFamily={LAT} transform="rotate(-12 180 180)">A</text>
        <text x={420} y={130} fontSize={40} fontFamily={LAT}>b</text>
        <text x={640} y={240} fontSize={46} fontFamily={AR}>ك</text>
        <text x={820} y={150} fontSize={38} fontFamily={LAT}>c</text>
        <text x={300} y={330} fontSize={36} fontFamily={AR}>م</text>
      </g>
      <Pool id={`${uid}-glow`} cx={L_BOSS.x} cy={470} rx={420} ry={360} color="#FFD98A" strength={0.5} />
      <path d={bookHill(170, 620, 280, 6, 30, 3) + bookHill(1250, 620, 260, 5, 32, 4) + bookHill(720, 620, 200, 3, 24, 6)} fill="#2E3470" />
      <path d={bookHill(470, 640, 300, 4, 26, 5) + bookHill(980, 640, 260, 4, 26, 7)} fill="#3A4A86" />
      <path d={canopy(-40, 1480, 650, 30, 900, 12, 0.6)} fill="#264E6A" />
    </>
  );
}

function Mid() {
  return (
    <>
      <path d="M-10 660 C400 640 1000 646 1450 664 V900 H-10Z" fill="#2F6B5C" />
      <path d="M-10 720 C420 704 1020 710 1450 726 V900 H-10Z" fill="#37775F" />
      <path d="M90 700 V560 M1380 700 V570" stroke="#4A3A5A" strokeWidth={12} strokeLinecap="round" />
      <path d={blobs([[90, 530, 54], [56, 566, 40], [130, 570, 40], [1380, 540, 50], [1346, 576, 38], [1416, 576, 38]])} fill="#2A8C7A" />
      <Scaled at={L_BOSS} from={[287, 346]}>
        <WordyLedge />
      </Scaled>
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
      <path d="M-10 830 C300 806 700 810 1000 822 C1200 830 1340 822 1450 814 V910 H-10Z" fill={`url(#${uid}-grass)`} />
      <path d="M600 910 C640 870 700 846 780 830 L820 832 C760 852 720 876 700 910Z" fill="#E7C98E" opacity={0.75} />
      <HeroMound id={`${uid}-hero`} cx={L_OWL.x} top={L_OWL.y} c={{ side: "#6E9A3A", sideDark: "#557F2C", top: "#9CC456", topLight: "#B6D670", rim: "#F4FBD0", grass: "#4E8A2A", light: "#FFE2A3" }} />
      <path d={`M${L_OWL.x + 110} ${L_OWL.y + 12} l40 -6 l6 15 l-40 6Z`} fill="#D21034" />
      <path d={`M${L_OWL.x - 160} ${L_OWL.y + 26} l34 5 l-3 14 l-34 -5Z`} fill="#1F4E8C" />
      <path d={grass([[560, 830, 22], [1000, 826, 20]], 37)} fill="#4E8A2A" />
      <EdgeFoliage dark="#123E44" mid="#1E6B5A" top="#0E1C3A" seed={41} />
      <path d={blobs([[60, 60, 10], [100, 110, 8], [1380, 80, 10], [1350, 130, 8], [40, 860, 10], [1400, 850, 10]])} fill="#F28CB8" />
    </>
  );
}

export const wordyLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: L_OWL },
};

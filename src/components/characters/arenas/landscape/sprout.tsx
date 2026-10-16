import { Pool, Sky } from "../common";
import { blobs, fan } from "../shapes";
import { blooms, SproutLedge } from "../sproutGarden";
import type { ArenaLayers } from "../types";
import { EdgeFoliage, HeroMound, L_BOSS, L_OWL, Scaled } from "./kit";

/** Sprouty's Nile garden, widescreen: the river across the whole view with a felucca, palms on the far bank. */

function Back({ uid }: { uid: string }) {
  const palms = [70, 130, 330, 560, 880, 1240, 1300, 1400];
  return (
    <>
      <Sky id={`${uid}-sky`} stops={[[0, "#4E86C7"], [0.45, "#8CC2E6"], [0.66, "#CDE8F0"]]} width={1460} height={910} />
      <path d={blobs([[200, 140, 30], [236, 128, 36], [272, 142, 28], [640, 90, 24], [668, 82, 30], [698, 92, 22]])} fill="#FFFFFF" opacity={0.75} />
      <Pool id={`${uid}-sun`} cx={L_BOSS.x} cy={460} rx={440} ry={360} color="#FFE7A0" strength={0.7} />
      <circle cx={1130} cy={400} r={54} fill="#FFF1C2" opacity={0.9} />
      <path d="M-10 600 C400 586 900 590 1450 598 V680 H-10Z" fill="#6FA08C" />
      <path d={palms.map((x) => `M${x} 600 V${540 - (x % 3) * 8}`).join(" ")} stroke="#4E6E62" strokeWidth={5} strokeLinecap="round" />
      <path d={palms.map((x, i) => fan(x, 540 - (x % 3) * 8, 6, 34, 6, -170, -10, 51 + i)).join("")} fill="#4E7E6A" />
      <path d="M-10 620 C400 612 900 616 1450 624 V690 C900 682 400 680 -10 688Z" fill="#3E8FC0" />
      <path d="M60 646 H160 M380 660 H500 M820 648 H940 M1200 658 H1300" stroke="#9FD3EE" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      <path d="M520 642 H572 L564 652 H528Z" fill="#7A4A1F" />
      <path d="M546 642 V572 L582 636Z" fill="#E6E2D4" />
      <path d="M543 642 V580 L520 632Z" fill="#D2C6A6" />
    </>
  );
}

function Mid() {
  const left = blooms([[40, 700, 1.6], [90, 726, 1.3], [20, 748, 1.4]]);
  return (
    <>
      <path d="M-10 690 C400 678 900 684 1450 696 V900 H-10Z" fill="#5E9A3E" />
      <path d="M-10 750 C420 736 960 742 1450 756 V900 H-10Z" fill="#6AA545" />
      <path d={blobs([[20, 700, 62], [96, 730, 46], [0, 760, 46]])} fill="#2F7A37" />
      <path d={left.petals} fill="#E23D5A" />
      <path d={left.centres} fill="#FFD34D" />
      <Scaled at={L_BOSS} from={[287, 328]}>
        <SproutLedge />
      </Scaled>
    </>
  );
}

function Floor({ uid }: { uid: string }) {
  const front = blooms([[60, 860, 2], [110, 836, 1.6], [1380, 850, 2], [1330, 874, 1.6]]);
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9CF5E" />
          <stop offset="1" stopColor="#86A83C" />
        </linearGradient>
      </defs>
      <path d="M-10 830 C300 806 700 810 1000 822 C1200 830 1340 822 1450 814 V910 H-10Z" fill={`url(#${uid}-field)`} />
      <path d="M640 910 C680 870 740 846 820 830 L860 832 C800 852 760 876 740 910Z" fill="#E7C98E" opacity={0.85} />
      <HeroMound id={`${uid}-hero`} cx={L_OWL.x} top={L_OWL.y} c={{ side: "#8A5A34", sideDark: "#6E4527", top: "#8CC24E", topLight: "#A8D664", rim: "#F4FBD0", grass: "#4E9A34", light: "#FFE7A0" }} />
      <EdgeFoliage dark="#1F6B2E" mid="#2E8B3E" top="#1A5A28" seed={91} />
      <path d={front.petals} fill="#E23D5A" />
      <path d={front.centres} fill="#FFD34D" />
    </>
  );
}

export const sproutLandscape: ArenaLayers = {
  Back,
  Mid,
  Floor,
  anchors: { boss: L_BOSS, owl: L_OWL },
};

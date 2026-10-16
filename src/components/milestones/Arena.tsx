import type { BossKey } from "@/lib/milestones/types";

/**
 * Full-bleed battle arenas, one per boss and subject, in the flat brand
 * illustration style (no strokes, layered shapes). Deep tones up top so the
 * glowing moves and white HUD read clearly; a soft floor where the boss and
 * the owl face off. Sudanese touches: Meroë pyramids, doum palms, the Nile,
 * Nubian painted walls and the zigzag border of Nubian weaving.
 */

function NubianBand({ y, colors = ["#007229", "#F59E0B", "#D21034"] }: { y: number; colors?: string[] }) {
  const teeth = Array.from({ length: 21 }, (_, i) => i * 20);
  return (
    <g>
      <rect x={0} y={y} width={400} height={26} fill="#1a1a1a" opacity={0.35} />
      {teeth.map((x, i) => (
        <path key={x} d={`M${x} ${y + 22} L${x + 10} ${y + 4} L${x + 20} ${y + 22}Z`} fill={colors[i % colors.length]} opacity={0.85} />
      ))}
    </g>
  );
}

function NumberCave() {
  return (
    <>
      <defs>
        <linearGradient id="arena-cave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#052814" />
          <stop offset="0.55" stopColor="#08361C" />
          <stop offset="1" stopColor="#0B4A26" />
        </linearGradient>
        <radialGradient id="arena-crystal" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={400} height={860} fill="url(#arena-cave)" />
      {/* the cave mouth and its rocky walls */}
      <path d="M0 0 H400 V250 C360 200 330 120 260 110 C200 100 170 150 120 140 C70 130 40 190 0 230Z" fill="#031C0E" />
      <path d="M0 330 C40 300 60 360 100 350 C70 420 40 470 0 480Z" fill="#06301A" />
      <path d="M400 360 C360 340 340 400 300 390 C330 450 360 500 400 510Z" fill="#06301A" />
      {/* amber and green crystals */}
      <circle cx={70} cy={210} r={40} fill="url(#arena-crystal)" />
      <path d="M58 228 L66 190 L74 228Z M72 230 L82 200 L90 230Z" fill="#F59E0B" />
      <circle cx={330} cy={300} r={36} fill="url(#arena-crystal)" opacity={0.7} />
      <path d="M320 318 L328 284 L336 318Z M334 320 L342 296 L350 320Z" fill="#F59E0B" />
      {/* the floor */}
      {/* the sandy floor */}
      <path d="M0 520 C120 490 280 490 400 520 V860 H0Z" fill="#B7843F" />
      <path d="M0 600 C140 580 260 580 400 600 V860 H0Z" fill="#9C6B2E" />
      <NubianBand y={834} />
    </>
  );
}

function WordLibrary({ wall = ["#123A3A", "#1E5250"], floor = "#7A4A26" }: { wall?: [string, string]; floor?: string }) {
  const spines = ["#007229", "#D21034", "#F59E0B", "#0E7490", "#7C3AED", "#D97706"];
  return (
    <>
      <defs>
        <linearGradient id="arena-lib" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wall[0]} />
          <stop offset="1" stopColor={wall[1]} />
        </linearGradient>
      </defs>
      <rect width={400} height={860} fill="url(#arena-lib)" />
      {/* tall shelves of books */}
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x={0} y={60 + row * 90} width={400} height={8} fill="#5B3A1E" />
          {Array.from({ length: 22 }, (_, i) => (
            <rect
              key={i}
              x={4 + i * 18}
              y={60 + row * 90 - 52 + ((i * 7 + row * 3) % 4) * 4}
              width={14}
              height={52 - ((i * 7 + row * 3) % 4) * 4}
              rx={2}
              fill={spines[(i + row * 2) % spines.length]}
              opacity={0.75}
            />
          ))}
        </g>
      ))}
      {/* a round window with the moon */}
      <circle cx={318} cy={300} r={46} fill="#0B2A2A" />
      <circle cx={318} cy={300} r={40} fill="#1F6F6B" />
      <circle cx={332} cy={288} r={14} fill="#FDE68A" />
      {/* letter bunting */}
      <path d="M0 270 Q120 300 260 268" stroke="#F5E6C8" strokeWidth={2} fill="none" />
      {["a", "b", "c", "d", "e"].map((letter, i) => (
        <g key={letter}>
          <path d={`M${20 + i * 50} ${276 + Math.sin(i) * 4} l18 0 l-9 22Z`} fill={spines[i]} />
        </g>
      ))}
      {/* wooden floor */}
      <path d="M0 500 H400 V860 H0Z" fill={floor} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={0} y={520 + i * 38} width={400} height={2} fill="#5B3A1E" opacity={0.5} />
      ))}
      <path d="M40 620 H360 L380 700 H20Z" fill="#B91C1C" opacity={0.5} />
      <NubianBand y={834} />
    </>
  );
}

function DesertDunes() {
  return (
    <>
      <defs>
        <linearGradient id="arena-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B1E0E" />
          <stop offset="0.45" stopColor="#B4470F" />
          <stop offset="0.7" stopColor="#E08A1E" />
        </linearGradient>
      </defs>
      <rect width={400} height={860} fill="url(#arena-dusk)" />
      <circle cx={300} cy={250} r={60} fill="#FCD34D" opacity={0.9} />
      {/* Meroë pyramids */}
      <path d="M20 360 L70 250 L120 360Z" fill="#7C2D12" />
      <path d="M90 360 L130 280 L170 360Z" fill="#6B260F" />
      <path d="M150 360 L180 300 L210 360Z" fill="#7C2D12" />
      {/* a doum palm */}
      <path d="M352 380 C350 340 356 320 360 300" stroke="#5B1E0E" strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M360 300 C340 290 326 296 318 306 M360 300 C380 288 394 294 400 304 M360 300 C352 280 340 276 330 278 M360 300 C370 280 384 278 392 282" stroke="#14532D" strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* dunes */}
      <path d="M0 360 C100 330 200 380 400 340 V860 H0Z" fill="#C2410C" />
      <path d="M0 470 C120 430 260 490 400 450 V860 H0Z" fill="#D97706" />
      <path d="M0 590 C140 560 280 600 400 570 V860 H0Z" fill="#B45309" />
      <NubianBand y={834} />
    </>
  );
}

function NileGarden() {
  return (
    <>
      <defs>
        <linearGradient id="arena-garden" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#052E2B" />
          <stop offset="0.5" stopColor="#065F46" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width={400} height={860} fill="url(#arena-garden)" />
      <g fill="#FDE68A">
        <circle cx={60} cy={60} r={2} />
        <circle cx={140} cy={30} r={1.5} />
        <circle cx={250} cy={70} r={2} />
        <circle cx={350} cy={40} r={1.5} />
      </g>
      <circle cx={320} cy={110} r={26} fill="#FEF3C7" opacity={0.9} />
      {/* palms along the Nile */}
      {[40, 380].map((x) => (
        <g key={x}>
          <path d={`M${x} 330 C${x - 4} 280 ${x + 4} 250 ${x} 220`} stroke="#3F2A14" strokeWidth={8} fill="none" strokeLinecap="round" />
          <path d={`M${x} 220 c-30 -6 -44 6 -50 18 M${x} 220 c30 -8 44 4 50 16 M${x} 220 c-12 -24 -30 -28 -40 -24 M${x} 220 c12 -24 30 -28 40 -24`} stroke="#15803D" strokeWidth={7} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* the river */}
      <path d="M0 300 C120 280 260 320 400 290 V350 C260 380 120 340 0 360Z" fill="#0E7490" />
      <path d="M40 318 h40 M180 330 h50 M300 312 h40" stroke="#67E8F9" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      {/* garden rows */}
      <path d="M0 380 H400 V860 H0Z" fill="#14532D" />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <rect x={0} y={420 + i * 70} width={400} height={18} fill="#3F2A14" opacity={0.45} />
          {Array.from({ length: 8 }, (_, j) => (
            <path key={j} d={`M${25 + j * 50} ${428 + i * 70} c-6 -10 -2 -16 0 -18 c2 2 6 8 0 18`} fill="#4ADE80" opacity={0.7} />
          ))}
        </g>
      ))}
      <NubianBand y={834} />
    </>
  );
}

function NubianVillage() {
  return (
    <>
      <defs>
        <linearGradient id="arena-village" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B0A14" />
          <stop offset="0.6" stopColor="#7F1D2D" />
          <stop offset="1" stopColor="#B4475A" />
        </linearGradient>
      </defs>
      <rect width={400} height={860} fill="url(#arena-village)" />
      <circle cx={70} cy={90} r={22} fill="#FEF3C7" opacity={0.9} />
      {/* painted Nubian houses with patterned doors */}
      {[
        { x: 0, w: 120, wall: "#38BDF8", door: "#F59E0B" },
        { x: 120, w: 150, wall: "#FDE68A", door: "#007229" },
        { x: 270, w: 130, wall: "#F9A8D4", door: "#2563EB" },
      ].map((house) => (
        <g key={house.x}>
          <rect x={house.x} y={190} width={house.w} height={170} fill={house.wall} opacity={0.85} />
          <rect x={house.x + house.w / 2 - 18} y={290} width={36} height={70} rx={18} fill={house.door} />
          {Array.from({ length: Math.floor(house.w / 20) }, (_, i) => (
            <path key={i} d={`M${house.x + i * 20} 206 l10 -12 l10 12Z`} fill="#FFFFFF" opacity={0.7} />
          ))}
          <rect x={house.x + 14} y={230} width={20} height={20} fill="#1E1B4B" opacity={0.5} transform={`rotate(45 ${house.x + 24} 240)`} />
        </g>
      ))}
      {/* puzzle-shaped stepping stones in the sandy yard */}
      <path d="M0 360 H400 V860 H0Z" fill="#B45309" />
      <path d="M0 420 H400 V860 H0Z" fill="#92400E" />
      <g fill="#FCD34D" opacity={0.25}>
        <path d="M40 560 h18 a8 8 0 1 1 16 0 h18 v18 a8 8 0 1 0 0 16 v18 h-52Z" />
        <path d="M290 640 h18 a8 8 0 1 1 16 0 h18 v18 a8 8 0 1 0 0 16 v18 h-52Z" />
      </g>
      <NubianBand y={834} colors={["#38BDF8", "#FDE68A", "#F9A8D4"]} />
    </>
  );
}

export default function Arena({ bossKey, powered = false, className = "" }: { bossKey: BossKey; powered?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 400 860" preserveAspectRatio="xMidYMin slice" className={className} aria-hidden="true" focusable="false">
      {bossKey === "number_giant" && <NumberCave />}
      {bossKey === "word_dragon" && <WordLibrary />}
      {bossKey === "letter_camel" && <DesertDunes />}
      {bossKey === "sprout_buddy" && <NileGarden />}
      {bossKey === "puzzle_owlet" && <NubianVillage />}
      {/* Harf's letter hall: the library in warm khalwa reds */}
      {bossKey === "letter_dragon" && <WordLibrary wall={["#3B1410", "#5A231A"]} floor="#6B3A1F" />}
      {/* phase 2: the arena glows warm as the boss powers up */}
      {powered && <rect width={400} height={860} fill="#D21034" opacity={0.14} />}
    </svg>
  );
}

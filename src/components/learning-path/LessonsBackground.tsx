'use client';

// A soft, detailed "learning world" backdrop for the Lessons path. A tinted sky
// with sun-glow + clouds at the top gives way to a rolling-hill horizon, then a
// green meadow that continues to the very bottom — so there are never white
// gaps and even long paths travel through scenery the whole way down. Grounded
// trees / bushes / flowers line both margins at a fixed vertical density (added
// procedurally so the density stays constant no matter how tall the path is),
// each with a soft shadow so it looks planted. Faint learning doodles drift
// behind the path. Pure inline SVG + CSS — a few KB, crisp at any size, no image
// requests (matters for low-end devices / limited data). Tinted per subject.

type Palette = {
  sky: string;
  sun: string;
  hills: [string, string, string]; // horizon, far→near
  meadow: string; // ground colour the gradient settles on
  treeLeaf: string;
  treeLeafDark: string;
  trunk: string;
  flower: string;
  doodle: string;
};

const PALETTES: Record<'math' | 'english' | 'default', Palette> = {
  // Maths — cool blue sky.
  math: {
    sky: 'linear-gradient(180deg, #e3eeff 0px, #ece7ff 110px, #e7f1e8 230px, #d3e8d8 330px, #cfe6d3 440px, #cfe6d3 100%)',
    sun: 'radial-gradient(900px 320px at 82% 70px, rgba(255,246,205,0.8), rgba(255,246,205,0) 70%)',
    hills: ['#dfe7f7', '#d2e8db', '#c2e1cb'],
    meadow: '#cfe6d3',
    treeLeaf: '#84cb9d',
    treeLeafDark: '#5cae7d',
    trunk: '#b78b5e',
    flower: '#dfb0c8',
    doodle: '#8f74cf',
  },
  // English — warm peach sky.
  english: {
    sky: 'linear-gradient(180deg, #ffeede 0px, #fde8ea 110px, #eef0e4 230px, #d6e8d6 330px, #cfe6d3 440px, #cfe6d3 100%)',
    sun: 'radial-gradient(900px 320px at 18% 70px, rgba(255,228,190,0.85), rgba(255,228,190,0) 70%)',
    hills: ['#fbdfcf', '#e7ecd4', '#c8e2cd'],
    meadow: '#cfe6d3',
    treeLeaf: '#84cb9d',
    treeLeafDark: '#5cae7d',
    trunk: '#b78b5e',
    flower: '#e9c193',
    doodle: '#ec8f55',
  },
  default: {
    sky: 'linear-gradient(180deg, #eaf1fb 0px, #efe9fb 110px, #e7f1e8 230px, #d3e8d8 330px, #cfe6d3 440px, #cfe6d3 100%)',
    sun: 'radial-gradient(900px 320px at 80% 70px, rgba(255,247,210,0.65), rgba(255,247,210,0) 70%)',
    hills: ['#e0e2f3', '#d6e9dd', '#c5e1cd'],
    meadow: '#cfe6d3',
    treeLeaf: '#84cb9d',
    treeLeafDark: '#5cae7d',
    trunk: '#b78b5e',
    flower: '#d8b2cb',
    doodle: '#8488cc',
  },
};

function paletteFor(subjectName?: string | null): Palette {
  const n = (subjectName || '').toLowerCase();
  if (n.includes('math')) return PALETTES.math;
  if (n.includes('english')) return PALETTES.english;
  return PALETTES.default;
}

/* ── building blocks ── */

function Doodle({ className, color, children }: { className: string; color: string; children: React.ReactNode }) {
  return (
    <svg className={`absolute ${className}`} style={{ color }} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// A planted tree: shadow on the ground + grass tuft at the base so it looks
// rooted rather than floating.
function Tree({ p, w, style }: { p: Palette; w: number; style: React.CSSProperties }) {
  return (
    <div className="absolute" style={{ ...style, width: w }}>
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 rounded-[50%]" style={{ width: w * 0.74, height: w * 0.18, background: 'rgba(40,80,55,0.16)', filter: 'blur(2px)' }} />
      <svg viewBox="0 0 60 84" fill="none" className="relative w-full">
        <rect x="27" y="48" width="6" height="30" rx="3" fill={p.trunk} />
        <circle cx="30" cy="30" r="20" fill={p.treeLeafDark} />
        <circle cx="18" cy="38" r="14" fill={p.treeLeaf} />
        <circle cx="42" cy="38" r="14" fill={p.treeLeaf} />
        <circle cx="30" cy="24" r="15" fill={p.treeLeaf} />
        <ellipse cx="30" cy="80" rx="14" ry="4" fill={p.treeLeafDark} opacity="0.5" />
      </svg>
    </div>
  );
}

function Bush({ p, w, style }: { p: Palette; w: number; style: React.CSSProperties }) {
  return (
    <div className="absolute" style={{ ...style, width: w }}>
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 rounded-[50%]" style={{ width: w * 0.78, height: w * 0.12, background: 'rgba(40,80,55,0.16)', filter: 'blur(2px)' }} />
      <svg viewBox="0 0 80 46" fill="none" className="relative w-full">
        <circle cx="22" cy="30" r="16" fill={p.treeLeafDark} />
        <circle cx="44" cy="26" r="20" fill={p.treeLeaf} />
        <circle cx="62" cy="32" r="14" fill={p.treeLeafDark} />
        <ellipse cx="42" cy="42" rx="36" ry="5" fill={p.treeLeaf} />
      </svg>
    </div>
  );
}

function Flower({ p, w, style }: { p: Palette; w: number; style: React.CSSProperties }) {
  return (
    <svg className="absolute anim-sway" style={{ ...style, width: w }} viewBox="0 0 24 34" fill="none">
      <path d="M12 34V14" stroke="#6fb389" strokeWidth="2.4" strokeLinecap="round" />
      <g fill={p.flower}>
        <circle cx="12" cy="8" r="4" />
        <circle cx="6" cy="11" r="4" />
        <circle cx="18" cy="11" r="4" />
        <circle cx="9" cy="16" r="4" />
        <circle cx="15" cy="16" r="4" />
      </g>
      <circle cx="12" cy="12" r="3" fill="#f1e3b4" />
    </svg>
  );
}

function Grass({ p, w, style }: { p: Palette; w: number; style: React.CSSProperties }) {
  return (
    <svg className="absolute" style={{ ...style, width: w }} viewBox="0 0 40 22" fill="none" stroke={p.treeLeafDark} strokeWidth="3" strokeLinecap="round">
      <path d="M8 22C8 15 6 11 4 7M14 22c0-8 1-12 3-16M20 22c0-7-2-11-4-15M26 22c0-8 1-12 4-16M32 22c0-7 2-11 4-15" />
    </svg>
  );
}

const SPARKLE = <path d="M24 8l3 11 11 3-11 3-3 11-3-11-11-3 11-3z" />;

// One doodle motif, cycled along the length.
function doodleAt(i: number, color: string) {
  const kinds = [
    <Doodle key="p" className="w-12 h-12 -rotate-12" color={color}><path d="M10 38l4-12 18-18 8 8-18 18-12 4z" /><path d="M30 14l8 8" /></Doodle>,
    <div key="123" className="text-[2.2rem] font-bold font-fredoka -rotate-6" style={{ color }}>123</div>,
    <Doodle key="bulb" className="w-12 h-12" color={color}><path d="M24 8a12 12 0 00-7 21c1 1 2 3 2 5h10c0-2 1-4 2-5A12 12 0 0024 8z" /><path d="M20 38h8M21 42h6" /></Doodle>,
    <Doodle key="book" className="w-14 h-14" color={color}><path d="M24 14c-4-3-10-4-16-3v22c6-1 12 0 16 3 4-3 10-4 16-3V11c-6-1-12 0-16 3z" /><path d="M24 14v23" /></Doodle>,
    <div key="abc" className="text-[1.7rem] font-bold font-fredoka rotate-3" style={{ color }}>ABC</div>,
    <Doodle key="ruler" className="w-12 h-12 rotate-45" color={color}><rect x="8" y="18" width="32" height="12" rx="2" /><path d="M14 18v5M20 18v7M26 18v5M32 18v7" /></Doodle>,
    <Doodle key="note" className="w-9 h-9" color={color}><path d="M18 34V12l16-4v18" /><circle cx="14" cy="34" r="4" /><circle cx="30" cy="30" r="4" /></Doodle>,
    <Doodle key="star" className="w-7 h-7" color={color}>{SPARKLE}</Doodle>,
    <Doodle key="tri" className="w-9 h-9 -rotate-6" color={color}><path d="M24 10l14 26H10z" /></Doodle>,
    <Doodle key="plus" className="w-8 h-8" color={color}><path d="M24 12v24M12 24h24" /></Doodle>,
  ];
  return kinds[i % kinds.length];
}

// Deterministic horizontal positions (no Math.random → no hydration mismatch).
// Kept near both edges so greenery frames the path corridor without covering it.
const LEFT_X = [2, 5, 3, 6, 2, 4];
const RIGHT_X = [2, 5, 3, 6, 2, 4];
const DOODLE_X = [38, 22, 64, 14, 82, 50, 30, 70, 18, 58];

export default function LessonsBackground({ subjectName }: { subjectName?: string | null }) {
  const p = paletteFor(subjectName);

  // Greenery stations down both margins, at a fixed pixel cadence so density is
  // constant for any path length. Generously tall; overflow-hidden clips extras.
  const FLORA_GAP = 230;
  const FLORA_N = 34;
  const FLORA_TOP = 300;

  const DOODLE_GAP = 300;
  const DOODLE_N = 26;
  const DOODLE_TOP = 150;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sky → meadow */}
      <div className="absolute inset-0" style={{ background: p.sky }} />
      <div className="absolute inset-0" style={{ background: p.sun }} />

      {/* Tiny birds */}
      <svg className="absolute top-[60px] left-[46%] w-16 h-8 opacity-30" viewBox="0 0 80 40" fill="none" stroke="#9aa3b8" strokeWidth="2" strokeLinecap="round">
        <path d="M6 20c4-6 8-6 12 0 4-6 8-6 12 0M40 14c4-6 8-6 12 0 4-6 8-6 12 0" />
      </svg>

      {/* Clouds — two layers drifting at different speeds */}
      <svg className="anim-cloud absolute -top-2 left-0 w-full h-52 opacity-85" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMin slice" fill="#ffffff">
        <g opacity="0.95"><ellipse cx="250" cy="74" rx="92" ry="34" /><ellipse cx="332" cy="84" rx="70" ry="28" /><ellipse cx="178" cy="88" rx="60" ry="24" /></g>
        <g opacity="0.65"><ellipse cx="690" cy="44" rx="72" ry="24" /><ellipse cx="752" cy="52" rx="50" ry="18" /></g>
      </svg>
      <svg className="anim-cloud-2 absolute -top-2 left-0 w-full h-52 opacity-80" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMin slice" fill="#ffffff">
        <g opacity="0.8"><ellipse cx="1086" cy="56" rx="100" ry="36" /><ellipse cx="1176" cy="70" rx="74" ry="28" /><ellipse cx="996" cy="72" rx="60" ry="24" /></g>
      </svg>

      {/* Butterflies (gentle wandering float), in the open band near the top so
          both are clearly seen and away from the road. */}
      <svg className="anim-butterfly absolute top-[165px] left-[30%] w-8 h-8 opacity-80" viewBox="0 0 32 32" fill={p.flower}>
        <ellipse cx="11" cy="12" rx="7" ry="9" /><ellipse cx="21" cy="12" rx="7" ry="9" />
        <ellipse cx="11" cy="22" rx="6" ry="7" /><ellipse cx="21" cy="22" rx="6" ry="7" />
        <rect x="15" y="9" width="2" height="16" rx="1" fill="#6b5b4a" />
      </svg>
      <svg className="anim-butterfly absolute top-[150px] right-[26%] w-7 h-7 opacity-75" style={{ animationDelay: '9s', animationDuration: '24s' }} viewBox="0 0 32 32" fill={p.flower}>
        <ellipse cx="11" cy="12" rx="7" ry="9" /><ellipse cx="21" cy="12" rx="7" ry="9" />
        <ellipse cx="11" cy="22" rx="6" ry="7" /><ellipse cx="21" cy="22" rx="6" ry="7" />
        <rect x="15" y="9" width="2" height="16" rx="1" fill="#6b5b4a" />
      </svg>

      {/* Rolling-hill horizon (sky → meadow transition, near the top) */}
      <div className="absolute left-0 w-full" style={{ top: 150, height: 360 }}>
        <svg className="absolute top-0 left-0 w-full h-[300px]" viewBox="0 0 1440 300" preserveAspectRatio="none" fill={p.hills[0]}><path d="M0 150c220-80 430-80 720 0s520 70 720 0v300H0z" /></svg>
        {/* far, hazy little trees on the back ridge (depth) */}
        <div className="absolute left-0 w-full" style={{ top: 96, opacity: 0.4 }}>
          <Tree p={p} w={26} style={{ left: '20%', top: 0 }} />
          <Tree p={p} w={22} style={{ left: '30%', top: 10 }} />
          <Tree p={p} w={28} style={{ left: '62%', top: 4 }} />
          <Tree p={p} w={22} style={{ left: '72%', top: 12 }} />
          <Tree p={p} w={24} style={{ left: '85%', top: 6 }} />
        </div>
        <svg className="absolute top-[60px] left-0 w-full h-[260px]" viewBox="0 0 1440 260" preserveAspectRatio="none" fill={p.hills[1]}><path d="M0 130c260 70 480 70 720 14s500-80 720-14v160H0z" /></svg>
        <svg className="absolute top-[140px] left-0 w-full h-[220px]" viewBox="0 0 1440 220" preserveAspectRatio="none" fill={p.hills[2]}><path d="M0 86c300-56 520-32 720 12s460 56 720-12v160H0z" /></svg>
        {/* soft mist drifting over the far hills */}
        <div className="anim-cloud-2 absolute top-[150px] left-0 w-full h-24" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))' }} />
      </div>

      {/* Faint learning doodles, distributed down the whole length */}
      <div className="absolute inset-0 opacity-[0.16]">
        {Array.from({ length: DOODLE_N }, (_, i) => (
          <div key={i} className="absolute" style={{ top: DOODLE_TOP + i * DOODLE_GAP, left: `${DOODLE_X[i % DOODLE_X.length]}%` }}>
            {doodleAt(i, p.doodle)}
          </div>
        ))}
      </div>

      {/* Grounded greenery lining both margins, full length */}
      {Array.from({ length: FLORA_N }, (_, i) => {
        const top = FLORA_TOP + i * FLORA_GAP;
        const onLeft = i % 2 === 0;
        const xPct = onLeft ? LEFT_X[i % LEFT_X.length] : RIGHT_X[i % RIGHT_X.length];
        const pos: React.CSSProperties = onLeft ? { top, left: `${xPct}%` } : { top, right: `${xPct}%` };
        const kind = i % 3; // tree, bush, tree(bigger)
        const w = kind === 1 ? 96 : 56 + (i % 2) * 14;
        return (
          <div key={`f${i}`}>
            {kind === 1 ? <Bush p={p} w={w} style={pos} /> : <Tree p={p} w={w} style={pos} />}
            {/* a little undergrowth nearby (staggered sway) */}
            <Flower p={p} w={18} style={{ top: top + (kind === 1 ? 20 : 50), animationDelay: `${(i % 6) * 0.5}s`, ...(onLeft ? { left: `${xPct + 6}%` } : { right: `${xPct + 6}%` }) }} />
            <Grass p={p} w={34} style={{ top: top + (kind === 1 ? 30 : 64), animationDelay: `${(i % 5) * 0.6}s`, ...(onLeft ? { left: `${xPct - 1}%` } : { right: `${xPct - 1}%` }) }} />
          </div>
        );
      })}

      {/* Denser flora band at the very bottom, with the destination flag-hill —
          the trail visibly leads somewhere. */}
      <div className="absolute inset-x-0 bottom-0 h-32">
        <Bush p={p} w={120} style={{ bottom: 4, left: '3%' }} />
        <Bush p={p} w={92} style={{ bottom: 4, left: '24%' }} />
        <Bush p={p} w={104} style={{ bottom: 4, left: '70%' }} />
        <Flower p={p} w={22} style={{ bottom: 8, left: '18%' }} />
        <Flower p={p} w={20} style={{ bottom: 6, left: '38%' }} />
        <Flower p={p} w={22} style={{ bottom: 8, left: '62%' }} />
        <Grass p={p} w={44} style={{ bottom: 4, left: '12%' }} />
        <Grass p={p} w={44} style={{ bottom: 4, left: '55%' }} />

        {/* Destination: a goal flag on a little summit */}
        <svg className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-32" viewBox="0 0 140 128" fill="none">
          {/* summit mound */}
          <ellipse cx="70" cy="116" rx="66" ry="22" fill={p.treeLeafDark} opacity="0.55" />
          <ellipse cx="70" cy="108" rx="54" ry="18" fill={p.treeLeaf} />
          {/* pole */}
          <rect x="67" y="34" width="5" height="76" rx="2.5" fill="#9c7a57" />
          {/* pennant */}
          <path d="M72 38h44l-12 12 12 12H72z" fill={p.flower} />
          <path d="M72 38h44l-12 12 12 12H72z" fill="#000" opacity="0.06" />
          {/* finial */}
          <circle cx="69.5" cy="34" r="5" fill="#ffe48a" stroke="#f2c84b" strokeWidth="1.5" />
          {/* bunting */}
          <path d="M14 92c30-14 82-14 112 0" stroke="#ffffff" strokeWidth="1.5" opacity="0.7" />
        </svg>
        {/* a small treehouse to the side */}
        <svg className="absolute bottom-4 right-[5%] w-20 h-20" viewBox="0 0 80 80" fill="none">
          <rect x="36" y="44" width="6" height="26" fill="#9c7a57" />
          <rect x="26" y="40" width="28" height="22" rx="3" fill="#d8a86d" stroke="#b5854c" strokeWidth="2" />
          <path d="M22 42l18-14 18 14z" fill="#c8773f" />
          <rect x="36" y="50" width="8" height="12" rx="1.5" fill="#7a5733" />
          <circle cx="40" cy="22" r="16" fill={p.treeLeaf} />
          <circle cx="28" cy="30" r="11" fill={p.treeLeafDark} />
          <circle cx="54" cy="30" r="11" fill={p.treeLeafDark} />
        </svg>
      </div>
    </div>
  );
}

'use client';

import { OwlWaving, OwlMath, OwlEnglish } from '@/components/illustrations';

// Illustrated scenes for the dashboard + landing page, in the same inline-SVG
// "learning world" style as the Lessons backdrop: a sky with sun + rainbow +
// clouds + a little school over rolling hills. Pure SVG/CSS — a few KB, crisp,
// no image requests. The owl characters are the existing owl components.

/* ── Reusable woodland elements (shared across the landing page) ── */

// A little bird with two flapping wings.
export function Bird({ className = '', color = '#7b8699' }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 40" fill="none">
      <path className="bird-wing-b" d="M30 22C22 10 12 9 5 14c9 1 16 5 23 12z" fill={color} opacity="0.7" />
      <ellipse cx="34" cy="23" rx="9" ry="6" fill={color} />
      <circle cx="41" cy="20" r="4" fill={color} />
      <path d="M44 19l7-1-5 4z" fill="#f6a21e" />
      <circle cx="42" cy="19" r="1" fill="#fff" />
      <path className="bird-wing-a" d="M34 22C42 10 52 9 59 14c-9 1-16 5-23 12z" fill={color} />
    </svg>
  );
}

// A few birds drifting across the section, at different heights + speeds.
export function FlyingBirds({ color = '#7b8699' }: { color?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bird-fly absolute" style={{ top: '16%' }}><Bird className="w-9 h-6" color={color} /></div>
      <div className="bird-fly-2 absolute" style={{ top: '30%', animationDelay: '7s' }}><Bird className="w-7 h-5" color={color} /></div>
      <div className="bird-fly-3 absolute" style={{ top: '9%', animationDelay: '14s' }}><Bird className="w-6 h-4" color={color} /></div>
    </div>
  );
}

// Soft drifting clouds — for sky-coloured sections.
export function CloudBand({ fill = '#ffffff', opacity = 0.8 }: { fill?: string; opacity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity }}>
      <svg className="anim-cloud absolute top-6 left-0 w-full h-24" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMin slice" fill={fill}>
        <g opacity="0.9"><ellipse cx="180" cy="50" rx="60" ry="22" /><ellipse cx="232" cy="58" rx="44" ry="16" /><ellipse cx="134" cy="60" rx="36" ry="14" /></g>
        <g opacity="0.7"><ellipse cx="760" cy="40" rx="52" ry="19" /><ellipse cx="808" cy="48" rx="36" ry="14" /></g>
      </svg>
      <svg className="anim-cloud-2 absolute top-12 left-0 w-full h-24" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMin slice" fill={fill}>
        <g opacity="0.6"><ellipse cx="520" cy="66" rx="56" ry="20" /><ellipse cx="572" cy="74" rx="38" ry="15" /></g>
      </svg>
    </div>
  );
}

// A soft scenic backdrop for a content section: a tinted sky fading to rolling
// hills at the bottom, so the whole landing page reads as one continuous
// "learning world" instead of plain white panels. Content sits above (z-10).
export function SectionScene({
  sky,
  hill,
  hill2,
  clouds = false,
  hills = true,
}: {
  sky: string;
  hill?: string;
  hill2?: string;
  clouds?: boolean;
  hills?: boolean;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: sky }} />
      {clouds && <CloudBand fill="#ffffff" opacity={0.6} />}
      {hills && (
        <>
          <svg className="absolute bottom-0 left-0 w-full h-28" viewBox="0 0 1440 112" preserveAspectRatio="none" fill={hill}>
            <path d="M0 60c240-46 440-20 720 10s500 30 720-12v54H0z" />
          </svg>
          <svg className="absolute bottom-0 left-0 w-full h-16" viewBox="0 0 1440 64" preserveAspectRatio="none" fill={hill2}>
            <path d="M0 34c280-26 480-6 720 8s500 8 720-12v34H0z" />
          </svg>
        </>
      )}
    </div>
  );
}

// A full-page meadow backdrop (sky → soft green) with lush foliage in the bottom
// corners — turns a plain content page into part of the "learning world".
function MeadowBush({ w, style }: { w: number; style: React.CSSProperties }) {
  return (
    <svg className="absolute bottom-0" style={{ ...style, width: w }} viewBox="0 0 80 46" fill="none">
      <circle cx="22" cy="30" r="16" fill="#5cae7d" />
      <circle cx="44" cy="26" r="20" fill="#84cb9d" />
      <circle cx="62" cy="32" r="14" fill="#5cae7d" />
      <ellipse cx="42" cy="42" rx="36" ry="5" fill="#84cb9d" />
    </svg>
  );
}
function MeadowFlower({ w, style }: { w: number; style: React.CSSProperties }) {
  return (
    <svg className="absolute" style={{ ...style, width: w }} viewBox="0 0 24 34" fill="none">
      <path d="M12 34V16" stroke="#7bbd92" strokeWidth="2.4" strokeLinecap="round" />
      <g fill="#dfb0c8"><circle cx="12" cy="10" r="4" /><circle cx="6" cy="13" r="4" /><circle cx="18" cy="13" r="4" /><circle cx="9" cy="18" r="4" /><circle cx="15" cy="18" r="4" /></g>
      <circle cx="12" cy="14" r="3" fill="#f1e3b4" />
    </svg>
  );
}
export function MeadowBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#f5faf3 0%,#eef6ec 36%,#e2f1e0 66%,#d4ebd4 100%)' }} />
      {/* rolling hills */}
      <svg className="absolute bottom-0 left-0 w-full h-44" viewBox="0 0 1440 180" preserveAspectRatio="none" fill="#d3ecd7"><path d="M0 92c260-70 460-40 720 6s520 50 720-10v92H0z" /></svg>
      <svg className="absolute bottom-0 left-0 w-full h-28" viewBox="0 0 1440 112" preserveAspectRatio="none" fill="#c3e4ca"><path d="M0 60c300-50 520-24 720 12s440 34 720-12v60H0z" /></svg>
      {/* lush corners */}
      <MeadowBush w={170} style={{ left: '-2%' }} />
      <MeadowBush w={110} style={{ left: '9%' }} />
      <MeadowBush w={190} style={{ right: '-3%' }} />
      <MeadowBush w={120} style={{ right: '8%' }} />
      <MeadowFlower w={24} style={{ bottom: 12, left: '20%' }} />
      <MeadowFlower w={20} style={{ bottom: 8, left: '27%' }} />
      <MeadowFlower w={24} style={{ bottom: 12, right: '18%' }} />
    </div>
  );
}

// A teacher owl presenting at a whiteboard/easel showing a chart + checkmarks
// (manage classes / grade / track) — for the "For Teachers" section.
export function TeacherScene({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      <span className="absolute top-1 left-[8%] text-white/70 text-xl">✦</span>
      <span className="absolute bottom-8 right-[6%] text-white/60 text-sm">✦</span>

      {/* whiteboard on an easel */}
      <svg className="absolute left-0 bottom-0 w-[64%]" viewBox="0 0 200 200" fill="none">
        {/* easel legs + tray */}
        <path d="M50 118L28 194M150 118L172 194M100 122v74" stroke="#b5894e" strokeWidth="6" strokeLinecap="round" />
        <path d="M44 162h112" stroke="#b5894e" strokeWidth="6" strokeLinecap="round" />
        {/* board */}
        <rect x="22" y="14" width="156" height="112" rx="11" fill="#fffdf7" stroke="#e7ddc8" strokeWidth="3" />
        {/* title line */}
        <rect x="38" y="26" width="64" height="7" rx="3.5" fill="#d8cdb4" />
        {/* bar chart + trend */}
        <rect x="40" y="84" width="14" height="26" rx="3" fill="#f4b34a" />
        <rect x="60" y="70" width="14" height="40" rx="3" fill="#1fb0a0" />
        <rect x="80" y="58" width="14" height="52" rx="3" fill="#ef8f44" />
        <path d="M47 86L67 72L87 60" stroke="#1fb0a0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* checklist */}
        <g>
          <circle cx="120" cy="52" r="6.5" fill="#1fb0a0" /><path d="M116.5 52l2.4 2.4 4.6-4.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="131" y="49" width="34" height="6" rx="3" fill="#e7ddc8" />
          <circle cx="120" cy="72" r="6.5" fill="#1fb0a0" /><path d="M116.5 72l2.4 2.4 4.6-4.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="131" y="69" width="28" height="6" rx="3" fill="#e7ddc8" />
          <circle cx="120" cy="92" r="6.5" fill="#1fb0a0" /><path d="M116.5 92l2.4 2.4 4.6-4.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="131" y="89" width="32" height="6" rx="3" fill="#e7ddc8" />
        </g>
      </svg>

      {/* owl teacher presenting */}
      <OwlWaving className="absolute right-[2%] bottom-3 w-[44%]" />
      <div className="absolute bottom-1 right-[12%] w-[28%] h-3 rounded-[50%] bg-black/15 blur-[2px]" />
    </div>
  );
}

// A studious owl sitting at a little desk with an open book + a potted plant.
export function StudyOwl({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      <OwlWaving className="absolute bottom-[30px] left-1/2 -translate-x-1/2 w-[58%]" />
      {/* desk (in front of the owl) */}
      <svg className="absolute bottom-0 left-[8%] w-[72%]" viewBox="0 0 128 64" fill="none">
        <path d="M62 17c-7-4-15-3-20-1v9c5-2 13-3 20 1z" fill="#fff8ec" stroke="#cbb083" strokeWidth="1.4" />
        <path d="M64 17c7-4 15-3 20-1v9c-5-2-13-3-20 1z" fill="#fffcf4" stroke="#cbb083" strokeWidth="1.4" />
        <rect x="4" y="26" width="120" height="11" rx="3" fill="#cf9259" />
        <rect x="4" y="26" width="120" height="4" rx="2" fill="#dca56e" />
        <rect x="18" y="37" width="7" height="26" rx="2" fill="#b07a42" />
        <rect x="103" y="37" width="7" height="26" rx="2" fill="#b07a42" />
      </svg>
      {/* potted plant */}
      <svg className="absolute bottom-1 right-0 w-[20%]" viewBox="0 0 36 56" fill="none">
        <path d="M18 32C10 26 8 15 12 9c3 5 6 9 6 17" fill="#7cc193" />
        <path d="M18 32c8-6 10-17 6-23-3 5-6 9-6 17" fill="#8fd0a6" />
        <path d="M18 36V24" stroke="#5fae7d" strokeWidth="2" />
        <path d="M11 40h14l-2 14H13z" fill="#d98b53" />
        <rect x="9" y="36" width="18" height="6" rx="2" fill="#e89a62" />
      </svg>
      {/* sparkles */}
      <span className="absolute top-0 left-[14%] text-amber-300 text-sm">✦</span>
      <span className="absolute top-2 right-[26%] text-amber-200 text-xs">✦</span>
    </div>
  );
}

// The big centered icon for a "how it works" step — a laptop (sign up), an open
// book with floating subject badges (choose subjects), or a star wand + backpack
// (start the adventure). No owl: the object itself is the hero of the card.
export function StepGraphic({ variant, className = '' }: { variant: 'account' | 'subjects' | 'adventure'; className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} aria-hidden>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] h-[82%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%)' }} />
      <span className="absolute top-1 left-[22%] text-amber-300 text-sm">✦</span>
      <span className="absolute top-4 right-[22%] text-amber-200 text-xs">✦</span>

      {variant === 'account' && (
        <svg className="relative w-[62%]" viewBox="0 0 104 74" fill="none">
          <rect x="24" y="6" width="56" height="38" rx="4" fill="#eef3fa" stroke="#c4d0e0" strokeWidth="2.5" />
          <circle cx="52" cy="22" r="8" fill="#86cc9e" />
          <path d="M41 37c2-7 20-7 22 0z" fill="#86cc9e" />
          <path d="M10 44h84l10 16H0z" fill="#d4dde9" />
          <rect x="0" y="58" width="104" height="5" rx="2.5" fill="#bcc9da" />
        </svg>
      )}

      {variant === 'subjects' && (
        <>
          <div className="absolute top-0 left-[6%] w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z" strokeLinejoin="round" /></svg>
          </div>
          <div className="absolute top-1 right-[6%] w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" strokeLinejoin="round" /></svg>
          </div>
          <div className="absolute top-[44%] right-[3%] w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shadow-sm text-violet-600 font-bold text-lg">π</div>
          <svg className="relative w-[52%]" viewBox="0 0 100 70" fill="none">
            <path d="M50 14C40 8 24 7 10 12v42c14-5 30-4 40 5z" fill="#0a7a30" />
            <path d="M50 14c10-6 26-7 40-2v42c-14-5-30-4-40 5z" fill="#0a8a37" />
            <path d="M50 18C41 13 27 12 16 16v32c11-4 24-3 34 4z" fill="#fff8ec" />
            <path d="M50 18c9-5 23-6 34-2v32c-11-4-24-3-34 4z" fill="#fffcf4" />
            <path d="M22 23q13-3 24 1M22 31q13-3 24 1M54 24q13-4 24-1M54 32q13-4 24-1" stroke="#d8c4a0" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M50 18v32" stroke="#cbb083" strokeWidth="1.6" />
          </svg>
        </>
      )}

      {variant === 'adventure' && (
        <svg className="relative w-[60%]" viewBox="0 0 104 80" fill="none">
          {/* wand — stick tucks up into the star so they connect */}
          <path d="M22 76L52 33" stroke="#caa15e" strokeWidth="5" strokeLinecap="round" />
          <path d="M52 6l5.6 11.4L70 19.2l-9 8.4 2.2 12.4-10.8-6.2-10.8 6.2 2.2-12.4-9-8.4 12.4-1.8z" fill="#ffd23f" stroke="#f2c01e" strokeWidth="1.6" strokeLinejoin="round" />
          {/* backpack */}
          <g transform="translate(58 42)">
            <path d="M4 9c0-6 5-9 11-9s11 3 11 9v20a3 3 0 01-3 3H7a3 3 0 01-3-3z" fill="#3f9c63" />
            <path d="M10 1c0-1.8 2.5-3 5-3s5 1.2 5 3" stroke="#2d7a4a" strokeWidth="2" fill="none" />
            <rect x="9" y="14" width="12" height="10" rx="2" fill="#bdebcd" />
            <path d="M4 11h22" stroke="#2d7a4a" strokeWidth="2" />
          </g>
        </svg>
      )}
    </div>
  );
}

// A richer, leafy green backdrop for the "how it works" section: a soft centre
// glow, organic tonal blobs, and a few leaf shapes creeping in from the edges.
function BigLeaf({ className, style, color = '#0a6e2a' }: { className: string; style?: React.CSSProperties; color?: string }) {
  return (
    <svg className={className} style={style} viewBox="0 0 80 120" fill="none">
      <path d="M40 4C12 30 6 76 40 116 74 76 68 30 40 4z" fill={color} />
      <path d="M40 14v94" stroke="#075a22" strokeWidth="2" opacity="0.5" />
      <path d="M40 38l16-12M40 60l18-11M40 82l16-9M40 38l-16-12M40 60l-18-11M40 82l-16-9" stroke="#075a22" strokeWidth="1.4" opacity="0.4" />
    </svg>
  );
}
export function LeafyGreenBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(130% 95% at 50% 16%, rgba(74,200,116,0.45), rgba(0,0,0,0) 62%)' }} />
      {/* soft organic tonal blobs */}
      <div className="absolute -top-14 left-[4%] w-72 h-72 bg-[#52cf7d] opacity-[0.16] blur-[2px] rounded-[58%_42%_55%_45%/52%_56%_44%_48%]" />
      <div className="absolute top-[6%] right-[2%] w-80 h-72 bg-[#52cf7d] opacity-[0.13] blur-[2px] rounded-[46%_54%_42%_58%/56%_44%_56%_44%]" />
      <div className="absolute bottom-[4%] left-[26%] w-64 h-56 bg-[#52cf7d] opacity-[0.10] blur-[2px] rounded-[55%_45%_48%_52%/45%_52%_48%_55%]" />
      <div className="absolute top-[38%] -left-10 w-56 h-56 bg-[#0a6e2a] opacity-[0.30] blur-[1px] rounded-[60%_40%_50%_50%/50%_55%_45%_50%]" />
      <div className="absolute bottom-[-6%] right-[8%] w-60 h-60 bg-[#0a6e2a] opacity-[0.22] blur-[1px] rounded-[48%_52%_55%_45%/52%_46%_54%_48%]" />
      {/* static leaves creeping in from the edges */}
      <BigLeaf className="absolute bottom-2 -left-6 w-24 rotate-[18deg]" />
      <BigLeaf className="absolute bottom-16 left-6 w-16 -rotate-12" />
      <BigLeaf className="absolute top-1/3 -right-7 w-20 rotate-[112deg]" />
      {/* leaves fluttering down on staggered loops */}
      <BigLeaf className="anim-leaf-fall absolute top-0 left-[16%] w-8 opacity-70" color="#0d7a30" style={{ animationDelay: '0s', animationDuration: '10s' }} />
      <BigLeaf className="anim-leaf-fall absolute top-0 left-[40%] w-10 opacity-80" style={{ animationDelay: '3.5s', animationDuration: '8.5s' }} />
      <BigLeaf className="anim-leaf-fall absolute top-0 left-[63%] w-7 opacity-65" color="#3a9c52" style={{ animationDelay: '6s', animationDuration: '11s' }} />
      <BigLeaf className="anim-leaf-fall absolute top-0 left-[82%] w-9 opacity-75" style={{ animationDelay: '1.5s', animationDuration: '9.5s' }} />
    </div>
  );
}

/* ── Landing hero scene: a tall sky → meadow with the owl trio on the hills ── */
function GroundShadow({ className }: { className: string }) {
  return <div className={`absolute left-1/2 -translate-x-1/2 bottom-0 rounded-[50%] bg-black/10 blur-[2px] ${className}`} />;
}

export function LandingHeroScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* sky → meadow */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#e4efff 0%,#eef0fb 26%,#eef6ee 52%,#dcefdd 76%,#cde8d2 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(1100px 360px at 82% 60px, rgba(255,246,205,0.7), rgba(255,246,205,0) 70%)' }} />

      {/* sun */}
      <div className="absolute top-8 right-[7%] hidden sm:block">
        <svg className="w-16 h-16 anim-sun" viewBox="0 0 64 64">
          <g stroke="#ffd23f" strokeWidth="3" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return <line key={i} x1={32 + Math.cos(a) * 24} y1={32 + Math.sin(a) * 24} x2={32 + Math.cos(a) * 31} y2={32 + Math.sin(a) * 31} />;
            })}
          </g>
          <circle cx="32" cy="32" r="20" fill="#ffe16b" />
          <circle cx="26" cy="29" r="2.4" fill="#7a5b1e" /><circle cx="38" cy="29" r="2.4" fill="#7a5b1e" />
          <path d="M25 37c3 4 11 4 14 0" stroke="#7a5b1e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="22" cy="36" r="2.5" fill="#ffb4a8" opacity="0.7" /><circle cx="42" cy="36" r="2.5" fill="#ffb4a8" opacity="0.7" />
        </svg>
      </div>

      {/* clouds */}
      <svg className="anim-cloud absolute top-6 left-0 w-full h-28 opacity-85" viewBox="0 0 1000 130" preserveAspectRatio="xMidYMin slice" fill="#fff">
        <g opacity="0.95"><ellipse cx="200" cy="56" rx="66" ry="24" /><ellipse cx="258" cy="64" rx="48" ry="18" /><ellipse cx="150" cy="66" rx="40" ry="16" /></g>
        <g opacity="0.7"><ellipse cx="640" cy="44" rx="54" ry="20" /><ellipse cx="690" cy="52" rx="38" ry="15" /></g>
      </svg>
      <svg className="anim-cloud-2 absolute top-10 left-0 w-full h-28 opacity-75" viewBox="0 0 1000 130" preserveAspectRatio="xMidYMin slice" fill="#fff">
        <g opacity="0.8"><ellipse cx="860" cy="72" rx="60" ry="22" /><ellipse cx="916" cy="80" rx="42" ry="16" /></g>
      </svg>

      {/* flapping birds gliding across the sky */}
      <FlyingBirds color="#8a93a6" />

      {/* rainbow rising from the hills (right) */}
      <svg className="absolute right-[5%] bottom-[120px] w-72 h-44 opacity-65 hidden md:block" viewBox="0 0 280 154" fill="none">
        {['#f7a1b6', '#ffce85', '#ffe488', '#9fd9a8', '#a9c8f5'].map((c, i) => {
          const r = 132 - i * 12;
          return <path key={i} d={`M${140 - r} 154 A ${r} ${r} 0 0 1 ${140 + r} 154`} stroke={c} strokeWidth="10" />;
        })}
      </svg>

      {/* rolling hills */}
      <svg className="absolute bottom-0 left-0 w-full h-[260px]" viewBox="0 0 1440 260" preserveAspectRatio="none" fill="#cfe6d3"><path d="M0 140c240-80 440-50 720 6s500 60 720-6v120H0z" /></svg>
      {/* distant trees on the ridge */}
      <div className="absolute left-0 w-full hidden sm:block" style={{ bottom: 196, opacity: 0.5 }}>
        {[14, 26, 64, 78, 88].map((x, i) => (
          <svg key={i} className="absolute w-6 h-8" style={{ left: `${x}%`, bottom: (i % 2) * 8 }} viewBox="0 0 60 80">
            <rect x="27" y="48" width="5" height="28" rx="2.5" fill="#b78b5e" />
            <circle cx="30" cy="28" r="18" fill="#74c08d" /><circle cx="18" cy="36" r="12" fill="#84cb9d" /><circle cx="42" cy="36" r="12" fill="#84cb9d" />
          </svg>
        ))}
      </div>
      <svg className="absolute bottom-0 left-0 w-full h-[170px]" viewBox="0 0 1440 170" preserveAspectRatio="none" fill="#bfe0c6"><path d="M0 96c280 60 480 60 720 8s520-70 720-8v66H0z" /></svg>
      <svg className="absolute bottom-0 left-0 w-full h-[96px]" viewBox="0 0 1440 96" preserveAspectRatio="none" fill="#aed7b6"><path d="M0 50c320-44 540-20 720 14s440 34 720-14v46H0z" /></svg>

      {/* owl trio standing on the hills */}
      <div className="absolute bottom-[26px] left-1/2 -translate-x-1/2 flex items-end justify-center gap-4 sm:gap-12">
        <div className="relative w-20 sm:w-28 hidden sm:block">
          <OwlMath className="w-full" />
          <GroundShadow className="w-16 h-3" />
        </div>
        <div className="relative w-32 sm:w-52">
          <OwlWaving className="w-full drop-shadow-md" />
          <GroundShadow className="w-24 h-4" />
        </div>
        <div className="relative w-20 sm:w-28 hidden sm:block">
          <OwlEnglish className="w-full" />
          <GroundShadow className="w-16 h-3" />
        </div>
      </div>

      {/* foreground flowers */}
      {[10, 22, 34, 66, 78, 90].map((x, i) => (
        <svg key={i} className="absolute bottom-2 w-4 h-6 opacity-80" style={{ left: `${x}%` }} viewBox="0 0 24 34" fill="none">
          <path d="M12 34V16" stroke="#7bbd92" strokeWidth="2.4" strokeLinecap="round" />
          <g fill={i % 2 ? '#e9c193' : '#dfb0c8'}><circle cx="12" cy="10" r="4" /><circle cx="6" cy="13" r="4" /><circle cx="18" cy="13" r="4" /><circle cx="9" cy="18" r="4" /><circle cx="15" cy="18" r="4" /></g>
          <circle cx="12" cy="14" r="3" fill="#f1e3b4" />
        </svg>
      ))}
    </div>
  );
}

/* ── Hero banner scene ── */
export function HeroScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sky → meadow */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #dcefff 0%, #e9f3ff 38%, #eaf7ec 70%, #dff1e2 100%)' }} />

      {/* Sun with a friendly face (top-right). Hidden on phones to keep it calm. */}
      <div className="absolute top-4 right-6 hidden sm:block">
        <svg className="w-14 h-14 anim-sun" viewBox="0 0 64 64">
          <g stroke="#ffd23f" strokeWidth="3" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return <line key={i} x1={32 + Math.cos(a) * 24} y1={32 + Math.sin(a) * 24} x2={32 + Math.cos(a) * 31} y2={32 + Math.sin(a) * 31} />;
            })}
          </g>
          <circle cx="32" cy="32" r="20" fill="#ffe16b" />
          <circle cx="26" cy="29" r="2.4" fill="#7a5b1e" />
          <circle cx="38" cy="29" r="2.4" fill="#7a5b1e" />
          <path d="M25 37c3 4 11 4 14 0" stroke="#7a5b1e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="22" cy="36" r="2.5" fill="#ffb4a8" opacity="0.7" />
          <circle cx="42" cy="36" r="2.5" fill="#ffb4a8" opacity="0.7" />
        </svg>
      </div>

      {/* Rainbow arcing up out of the hills on the right. Its baseline sits at
          the banner bottom so the legs are covered by the hills (drawn after it)
          — it reads as rising from the ground rather than floating. */}
      <svg className="absolute right-8 bottom-0 w-64 h-44 opacity-75 hidden sm:block" viewBox="0 0 280 154" fill="none">
        {['#f7a1b6', '#ffce85', '#ffe488', '#9fd9a8', '#a9c8f5'].map((c, i) => {
          const r = 132 - i * 12;
          return <path key={i} d={`M${140 - r} 154 A ${r} ${r} 0 0 1 ${140 + r} 154`} stroke={c} strokeWidth="10" />;
        })}
      </svg>

      {/* Clouds */}
      <svg className="anim-cloud absolute top-3 left-0 w-full h-24 opacity-90" viewBox="0 0 800 120" preserveAspectRatio="xMidYMin slice" fill="#ffffff">
        <g opacity="0.95"><ellipse cx="150" cy="48" rx="46" ry="18" /><ellipse cx="192" cy="54" rx="34" ry="14" /><ellipse cx="116" cy="56" rx="30" ry="12" /></g>
        <g opacity="0.8"><ellipse cx="470" cy="36" rx="40" ry="15" /><ellipse cx="508" cy="44" rx="28" ry="11" /></g>
      </svg>

      {/* Rolling hills */}
      <svg className="absolute bottom-0 left-0 w-full h-24" viewBox="0 0 800 96" preserveAspectRatio="none" fill="#cdeccf"><path d="M0 50c160-44 280-20 400 6s260 30 400-10v50H0z" /></svg>
      <svg className="absolute bottom-0 left-0 w-full h-14" viewBox="0 0 800 56" preserveAspectRatio="none" fill="#bfe6c4"><path d="M0 30c180-30 300-6 400 8s240 14 400-12v30H0z" /></svg>

      {/* Little school on a hill in the open centre (clear of text + owl).
          Hidden on phones where there isn't room. */}
      <svg className="absolute bottom-3 left-[46%] -translate-x-1/2 w-24 h-24 hidden md:block" viewBox="0 0 120 120" fill="none">
        <rect x="58" y="14" width="3" height="20" fill="#b5854c" />
        <path d="M61 15h16l-5 6 5 6H61z" fill="#e8556d" />
        <rect x="44" y="42" width="32" height="52" fill="#f4d9a8" stroke="#d8b87f" strokeWidth="2" />
        <path d="M40 42l20-14 20 14z" fill="#d2873f" />
        <circle cx="60" cy="55" r="6" fill="#fff" stroke="#c79a55" strokeWidth="1.5" />
        <path d="M60 55v-3M60 55l2 1" stroke="#7a5b2e" strokeWidth="1.2" strokeLinecap="round" />
        <rect x="18" y="64" width="32" height="30" fill="#f6e0b6" stroke="#d8b87f" strokeWidth="2" />
        <rect x="70" y="64" width="32" height="30" fill="#f6e0b6" stroke="#d8b87f" strokeWidth="2" />
        <path d="M16 64l18-12 18 12z" fill="#d2873f" />
        <path d="M68 64l18-12 18 12z" fill="#d2873f" />
        <rect x="53" y="72" width="14" height="22" rx="7" fill="#c2773f" />
        <rect x="26" y="72" width="8" height="8" fill="#9fc8e8" />
        <rect x="86" y="72" width="8" height="8" fill="#9fc8e8" />
      </svg>

      {/* a few flowers along the front */}
      {[14, 24, 66, 80].map((x, i) => (
        <svg key={i} className="absolute bottom-2 w-4 h-6 opacity-80" style={{ left: `${x}%` }} viewBox="0 0 24 34" fill="none">
          <path d="M12 34V16" stroke="#7bbd92" strokeWidth="2.4" strokeLinecap="round" />
          <g fill={i % 2 ? '#e9c193' : '#dfb0c8'}>
            <circle cx="12" cy="10" r="4" /><circle cx="6" cy="13" r="4" /><circle cx="18" cy="13" r="4" /><circle cx="9" cy="18" r="4" /><circle cx="15" cy="18" r="4" />
          </g>
          <circle cx="12" cy="14" r="3" fill="#f1e3b4" />
        </svg>
      ))}
    </div>
  );
}

/* ── Subject card scene ── */
export function SubjectScene({ variant }: { variant: 'math' | 'english' | 'default' }) {
  const tint =
    variant === 'math'
      ? 'linear-gradient(135deg, #e8f6ec 0%, #d9efdd 100%)'
      : variant === 'english'
        ? 'linear-gradient(135deg, #fdeef0 0%, #fbe0e6 100%)'
        : 'linear-gradient(135deg, #eef2fb 0%, #e3e9f6 100%)';
  const hill = variant === 'english' ? '#f6cdd6' : '#bfe3c6';
  const hill2 = variant === 'english' ? '#f3bcc8' : '#aedbb8';

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: tint }} />

      {/* Illustrative subject symbols, spaced around the card (clear of the owl
          on the right and the title on the left). */}
      {variant === 'math' ? (
        <div className="absolute inset-0 text-[#5aa87a]">
          {/* curvy arrow */}
          <svg className="absolute top-[12%] left-[55%] w-9 h-9 opacity-60" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 26c2-12 14-18 26-14" /><path d="M26 6l8 6-8 6" />
          </svg>
          {/* square root √x */}
          <div className="absolute top-[13%] left-[66%] text-2xl font-bold font-fredoka opacity-65">√x</div>
          {/* triangle */}
          <svg className="absolute top-[8%] left-[76%] w-10 h-10 opacity-55 -rotate-6" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
            <path d="M24 8l16 30H8z" />
          </svg>
          {/* plus */}
          <svg className="absolute top-[58%] left-[57%] w-8 h-8 opacity-60" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
            <path d="M20 8v24M8 20h24" />
          </svg>
          {/* cube */}
          <svg className="absolute top-[54%] left-[67%] w-10 h-10 opacity-55" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M24 6l16 9v18l-16 9-16-9V15z" /><path d="M24 6v9m0 0l16 9M24 15L8 24m16 9V24" />
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0">
          {/* speech bubble */}
          <svg className="absolute top-[12%] left-[55%] w-10 h-10 opacity-55 text-[#e58aa0]" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
            <path d="M6 9h28v18H18l-7 6v-6H6z" />
          </svg>
          {/* A in a circle badge */}
          <div className="absolute top-[13%] left-[66%] w-9 h-9 rounded-full bg-[#f6d3dd] flex items-center justify-center text-lg font-bold font-fredoka text-[#d2456a] opacity-80">A</div>
          {/* B in a square badge */}
          <div className="absolute top-[8%] left-[76%] w-9 h-9 rounded-xl bg-[#cfe6d4] flex items-center justify-center text-lg font-bold font-fredoka text-[#3f9c63] opacity-80 rotate-6">B</div>
          {/* ampersand curl */}
          <div className="absolute top-[58%] left-[57%] text-2xl font-bold font-fredoka text-[#e0a25f] opacity-70">&amp;</div>
          {/* C */}
          <div className="absolute top-[54%] left-[67%] text-2xl font-bold font-fredoka text-[#e58aa0] opacity-70">C</div>
        </div>
      )}

      {/* hills at the bottom (taller, so the owl can sit on them) */}
      <svg className="absolute bottom-0 left-0 w-full h-24" viewBox="0 0 400 96" preserveAspectRatio="none" fill={hill}><path d="M0 54c90-30 150-12 220 6s120 14 180-14v44H0z" /></svg>
      <svg className="absolute bottom-0 left-0 w-full h-14" viewBox="0 0 400 56" preserveAspectRatio="none" fill={hill2}><path d="M0 30c100-22 160-4 220 8s100 6 180-12v30H0z" /></svg>

      {/* soft ground shadow where the owl stands (bottom-right) */}
      <div className="absolute bottom-3 right-6 sm:right-9 w-24 sm:w-28 h-3 rounded-[50%] bg-black/10 blur-[2px]" />
    </div>
  );
}

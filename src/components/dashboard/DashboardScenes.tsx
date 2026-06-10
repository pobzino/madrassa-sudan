'use client';

// Illustrated scenes for the dashboard, in the same inline-SVG "learning world"
// style as the Lessons backdrop: a sky with sun + rainbow + clouds + a little
// school over rolling hills for the hero, and tinted, doodle-dressed scenes for
// the subject cards. Pure SVG/CSS — a few KB, crisp, no image requests. The owl
// characters are layered on top by the page using the existing owl components.

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

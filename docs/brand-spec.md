# Amal School brand and motion reference

## Existing visual system

- Primary green: `#007229`; light green: `#00913D`; dark green: `#005C22`
- Primary red: `#D21034`; light red: `#E8334F`; dark red: `#A01028`
- Accent gold: `#F59E0B` / `#D97706`
- Main text: `#0F172A`; muted text: `#64748B`
- Light surfaces: `#FFFFFF`, `#F8FAFC`, `#F0FDF4`, `#FEF2F2`
- Display type: Fredoka; body type: Inter; Arabic type: Cairo

## Source assets

- Mascot library: `src/components/illustrations.tsx`
- Flag-to-owl brand morph: `src/components/brand/SudanFlagToAmalOwl.tsx`
- Brand morph geometry: `src/lib/brand-morph-paths.ts`
- Homepage learning-world illustrations: `src/components/dashboard/DashboardScenes.tsx`
- Standalone icon: `public/icons/icon.svg`

## Protected homepage contract

- Keep the current illustrated hero, headline, calls to action, and owl trio.
- Keep all existing navigation routes, section anchors, analytics attributes, and lesson interactions.
- Preserve English/Arabic switching and RTL layout.
- New visual work should reuse the existing palette, typography, rounded illustration language, and owl artwork.

## Motion direction

- Use one concentrated scroll-driven mascot moment rather than repeated spectacle.
- The owl should participate in the page structure: guide, reveal, or transition into real content.
- Keep secondary motion soft and character-led (blink, wave, tassel sway).
- Always provide a static `prefers-reduced-motion` presentation with the same content and hierarchy.

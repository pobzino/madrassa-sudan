import type { SVGProps } from "react";
import { COUNTABLE_KEYS, COUNTABLE_NAMES, countableFor, isCountableKey, type CountableKey } from "@/lib/countables";

export { COUNTABLE_KEYS, COUNTABLE_NAMES, countableFor, isCountableKey, type CountableKey };

/**
 * Things a child can count in a tap-to-count move, drawn in the brand's style
 * instead of platform emoji. The generator asks for an emoji; `countableFor`
 * maps the common ones onto these, and anything unknown becomes a star.
 */
type Props = SVGProps<SVGSVGElement> & { kind: CountableKey };

/** One countable thing, 24-unit square, scales with font size. */
export function Countable({ kind, ...rest }: Props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#1a1a1a" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {SHAPES[kind]}
    </svg>
  );
}

/** The same drawing as a standalone SVG string (for effects that spawn plain elements). */
export function countableSvgMarkup(kind: CountableKey, px: number): string {
  const inner = MARKUP[kind];
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="#1a1a1a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

const SHAPES: Record<CountableKey, React.ReactNode> = {
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8L12 3Z" fill="#F59E0B" />,
  apple: (
    <>
      <path d="M12 7.5c-1.5-1.2-3.8-1-5.2.6-2.1 2.5-1.3 7.6 1.2 10.5 1.2 1.4 2.6 1.6 4 .9 1.4.7 2.8.5 4-.9 2.5-2.9 3.3-8 1.2-10.5-1.4-1.6-3.7-1.8-5.2-.6Z" fill="#D21034" />
      <path d="M12 7.5c0-2 1-3.2 2.5-3.8" />
      <path d="M12.5 6.2c1.5-1.8 3.3-2 4.2-1.5-.4 1.4-1.9 2.5-4.2 2.3Z" fill="#4ADE80" />
    </>
  ),
  banana: <path d="M5 8c1 6 5 10 11.5 10.5 1.5.1 2.5-.5 2.5-1.5-5 .5-9-3-10.5-9C8 6.5 7.5 6 6.5 6.2 5.5 6.4 4.8 7 5 8Z" fill="#FDE047" />,
  orange: (
    <>
      <circle cx="12" cy="13" r="7.5" fill="#FB923C" />
      <path d="M12 5.5c.3-1.5 1.3-2.3 3-2.3" />
      <path d="M12.5 5c1.5-1.3 3-1.3 4 -.5-.8 1-2.3 1.4-4 .5Z" fill="#4ADE80" />
      <circle cx="9.5" cy="11" r="1" fill="#FED7AA" stroke="none" />
    </>
  ),
  fish: (
    <>
      <path d="M4 12c2.5-4 6-5.5 9.5-5.5 3 0 5 2 6.5 5.5-1.5 3.5-3.5 5.5-6.5 5.5C10 17.5 6.5 16 4 12Z" fill="#38BDF8" />
      <path d="M20 12l3-3.5v7L20 12Z" fill="#0EA5E9" />
      <circle cx="8.5" cy="11" r="1.1" fill="#1a1a1a" stroke="none" />
      <path d="M12 8.5c1.5 1.8 1.5 5.2 0 7" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="5.5" r="2.8" fill="#F472B6" />
      <circle cx="18.5" cy="12" r="2.8" fill="#F472B6" />
      <circle cx="12" cy="18.5" r="2.8" fill="#F472B6" />
      <circle cx="5.5" cy="12" r="2.8" fill="#F472B6" />
      <circle cx="12" cy="12" r="3" fill="#FDE047" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-13 0 9-5 14-14 13Z" fill="#4ADE80" />
      <path d="M5 19c3-4 6-7 10-9" />
    </>
  ),
  balloon: (
    <>
      <path d="M12 3c-3.6 0-6 2.8-6 6.5 0 3.5 2.6 7 6 7.5 3.4-.5 6-4 6-7.5C18 5.8 15.6 3 12 3Z" fill="#F87171" />
      <path d="M11 17h2l-1 1.5-1-1.5ZM12 18.5c-1 1.5.5 2.5-.5 3.5" />
      <path d="M9 7c.5-1.2 1.4-2 2.5-2.3" stroke="#fff" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="#fff" />
      <path d="M12 7.5l3.2 2.3-1.2 3.7H10l-1.2-3.7L12 7.5Z" fill="#1a1a1a" />
      <path d="M12 7.5V4M15.2 9.8l3.3-1.3M14 13.5l2 3M10 13.5l-2 3M8.8 9.8 5.5 8.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h11a2 2 0 0 1 2 2V19H7a2 2 0 0 0-2 2V4.5Z" fill="#007229" />
      <path d="M5 19a2 2 0 0 1 2-2h11" />
      <path d="M8.5 8.5h6M8.5 11.5h6" stroke="#fff" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1.2-4.6L15.6 5a2.2 2.2 0 0 1 3.1 0l.3.3a2.2 2.2 0 0 1 0 3.1L8.6 18.8 4 20Z" fill="#F59E0B" />
      <path d="M14 6.6l3.4 3.4M5.2 15.4l3.4 3.4" />
    </>
  ),
  egg: (
    <>
      <path d="M12 3c-3.5 0-6.5 5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8 15.5 3 12 3Z" fill="#FFF7ED" />
      <path d="M9 8c.5-1.5 1.3-2.6 2.2-3.3" stroke="#fff" />
    </>
  ),
  heart: <path d="M12 20.5 4.5 13A4.3 4.3 0 0 1 10.6 6.9L12 8.3l1.4-1.4A4.3 4.3 0 0 1 19.5 13L12 20.5Z" fill="#D21034" />,
  bird: (
    <>
      <path d="M5 13c2-5 6-7 10-6l4 1-2.5 1.5c1 3-1 7-5.5 8.5C8 19 5.5 16.5 5 13Z" fill="#60A5FA" />
      <path d="M3 12.5 5 13l-1 2" fill="#F59E0B" />
      <circle cx="14" cy="10" r="1" fill="#1a1a1a" stroke="none" />
      <path d="M9 19.5v2M12 19v2.5" />
    </>
  ),
  car: (
    <>
      <path d="M4 14l2-5a2 2 0 0 1 1.8-1.2h8.4A2 2 0 0 1 18 9l2 5v4H4v-4Z" fill="#EF4444" />
      <path d="M7.5 9.5h9l1 3h-11l1-3Z" fill="#BFDBFE" />
      <circle cx="8" cy="18" r="2" fill="#1a1a1a" />
      <circle cx="16" cy="18" r="2" fill="#1a1a1a" />
    </>
  ),
  cup: (
    <>
      <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" fill="#FDE68A" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 4.5c-.5 1 .5 1.5 0 2.5M11.5 4.5c-.5 1 .5 1.5 0 2.5" stroke="#9CA3AF" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="5" fill="#FDE047" stroke="#F59E0B" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#F59E0B" />
    </>
  ),
  moon: <path d="M15 3.5a8.5 8.5 0 1 0 5.5 14.5A7 7 0 0 1 15 3.5Z" fill="#FDE68A" />,
  candy: (
    <>
      <ellipse cx="12" cy="12" rx="5" ry="4.2" fill="#F472B6" />
      <path d="M7 12 3.5 9.5v5L7 12ZM17 12l3.5-2.5v5L17 12Z" fill="#F9A8D4" />
      <path d="M10 9.5c1 1.5 1 3.5 0 5M14 9.5c-1 1.5-1 3.5 0 5" stroke="#fff" />
    </>
  ),
  butterfly: (
    <>
      <path d="M12 12C9 6 3 6 3.5 10.5c.3 2.5 3 3 5 2.5-2 .5-4.5 2-4 4.5.5 3 5.5 2 7.5-5.5Z" fill="#A78BFA" />
      <path d="M12 12c3-6 9-6 8.5-1.5-.3 2.5-3 3-5 2.5 2 .5 4.5 2 4 4.5-.5 3-5.5 2-7.5-5.5Z" fill="#C4B5FD" />
      <path d="M12 7v10M10.5 6 9 4M13.5 6 15 4" />
    </>
  ),
  tree: (
    <>
      <path d="M12 2.5 5 12h3l-3 5h14l-3-5h3L12 2.5Z" fill="#4ADE80" stroke="#007229" />
      <path d="M10.5 17h3v4.5h-3V17Z" fill="#92400E" stroke="#7C2D12" />
    </>
  ),
};

const MARKUP: Record<CountableKey, string> = {
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8L12 3Z" fill="#F59E0B"/>',
  apple: '<path d="M12 7.5c-1.5-1.2-3.8-1-5.2.6-2.1 2.5-1.3 7.6 1.2 10.5 1.2 1.4 2.6 1.6 4 .9 1.4.7 2.8.5 4-.9 2.5-2.9 3.3-8 1.2-10.5-1.4-1.6-3.7-1.8-5.2-.6Z" fill="#D21034"/><path d="M12 7.5c0-2 1-3.2 2.5-3.8"/><path d="M12.5 6.2c1.5-1.8 3.3-2 4.2-1.5-.4 1.4-1.9 2.5-4.2 2.3Z" fill="#4ADE80"/>',
  banana: '<path d="M5 8c1 6 5 10 11.5 10.5 1.5.1 2.5-.5 2.5-1.5-5 .5-9-3-10.5-9C8 6.5 7.5 6 6.5 6.2 5.5 6.4 4.8 7 5 8Z" fill="#FDE047"/>',
  orange: '<circle cx="12" cy="13" r="7.5" fill="#FB923C"/><path d="M12 5.5c.3-1.5 1.3-2.3 3-2.3"/><path d="M12.5 5c1.5-1.3 3-1.3 4-.5-.8 1-2.3 1.4-4 .5Z" fill="#4ADE80"/>',
  fish: '<path d="M4 12c2.5-4 6-5.5 9.5-5.5 3 0 5 2 6.5 5.5-1.5 3.5-3.5 5.5-6.5 5.5C10 17.5 6.5 16 4 12Z" fill="#38BDF8"/><path d="M20 12l3-3.5v7L20 12Z" fill="#0EA5E9"/><circle cx="8.5" cy="11" r="1.1" fill="#1a1a1a" stroke="none"/>',
  flower: '<circle cx="12" cy="5.5" r="2.8" fill="#F472B6"/><circle cx="18.5" cy="12" r="2.8" fill="#F472B6"/><circle cx="12" cy="18.5" r="2.8" fill="#F472B6"/><circle cx="5.5" cy="12" r="2.8" fill="#F472B6"/><circle cx="12" cy="12" r="3" fill="#FDE047"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-13 0 9-5 14-14 13Z" fill="#4ADE80"/><path d="M5 19c3-4 6-7 10-9"/>',
  balloon: '<path d="M12 3c-3.6 0-6 2.8-6 6.5 0 3.5 2.6 7 6 7.5 3.4-.5 6-4 6-7.5C18 5.8 15.6 3 12 3Z" fill="#F87171"/><path d="M11 17h2l-1 1.5-1-1.5ZM12 18.5c-1 1.5.5 2.5-.5 3.5"/>',
  ball: '<circle cx="12" cy="12" r="8.5" fill="#fff"/><path d="M12 7.5l3.2 2.3-1.2 3.7H10l-1.2-3.7L12 7.5Z" fill="#1a1a1a"/><path d="M12 7.5V4M15.2 9.8l3.3-1.3M14 13.5l2 3M10 13.5l-2 3M8.8 9.8 5.5 8.5"/>',
  book: '<path d="M5 4.5h11a2 2 0 0 1 2 2V19H7a2 2 0 0 0-2 2V4.5Z" fill="#007229"/><path d="M5 19a2 2 0 0 1 2-2h11"/><path d="M8.5 8.5h6M8.5 11.5h6" stroke="#fff"/>',
  pencil: '<path d="M4 20l1.2-4.6L15.6 5a2.2 2.2 0 0 1 3.1 0l.3.3a2.2 2.2 0 0 1 0 3.1L8.6 18.8 4 20Z" fill="#F59E0B"/><path d="M14 6.6l3.4 3.4M5.2 15.4l3.4 3.4"/>',
  egg: '<path d="M12 3c-3.5 0-6.5 5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8 15.5 3 12 3Z" fill="#FFF7ED"/>',
  heart: '<path d="M12 20.5 4.5 13A4.3 4.3 0 0 1 10.6 6.9L12 8.3l1.4-1.4A4.3 4.3 0 0 1 19.5 13L12 20.5Z" fill="#D21034"/>',
  bird: '<path d="M5 13c2-5 6-7 10-6l4 1-2.5 1.5c1 3-1 7-5.5 8.5C8 19 5.5 16.5 5 13Z" fill="#60A5FA"/><path d="M3 12.5 5 13l-1 2" fill="#F59E0B"/><circle cx="14" cy="10" r="1" fill="#1a1a1a" stroke="none"/>',
  car: '<path d="M4 14l2-5a2 2 0 0 1 1.8-1.2h8.4A2 2 0 0 1 18 9l2 5v4H4v-4Z" fill="#EF4444"/><path d="M7.5 9.5h9l1 3h-11l1-3Z" fill="#BFDBFE"/><circle cx="8" cy="18" r="2" fill="#1a1a1a"/><circle cx="16" cy="18" r="2" fill="#1a1a1a"/>',
  cup: '<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" fill="#FDE68A"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  sun: '<circle cx="12" cy="12" r="5" fill="#FDE047" stroke="#F59E0B"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#F59E0B"/>',
  moon: '<path d="M15 3.5a8.5 8.5 0 1 0 5.5 14.5A7 7 0 0 1 15 3.5Z" fill="#FDE68A"/>',
  candy: '<ellipse cx="12" cy="12" rx="5" ry="4.2" fill="#F472B6"/><path d="M7 12 3.5 9.5v5L7 12ZM17 12l3.5-2.5v5L17 12Z" fill="#F9A8D4"/>',
  butterfly: '<path d="M12 12C9 6 3 6 3.5 10.5c.3 2.5 3 3 5 2.5-2 .5-4.5 2-4 4.5.5 3 5.5 2 7.5-5.5Z" fill="#A78BFA"/><path d="M12 12c3-6 9-6 8.5-1.5-.3 2.5-3 3-5 2.5 2 .5 4.5 2 4 4.5-.5 3-5.5 2-7.5-5.5Z" fill="#C4B5FD"/><path d="M12 7v10M10.5 6 9 4M13.5 6 15 4"/>',
  tree: '<path d="M12 2.5 5 12h3l-3 5h14l-3-5h3L12 2.5Z" fill="#4ADE80" stroke="#007229"/><path d="M10.5 17h3v4.5h-3V17Z" fill="#92400E" stroke="#7C2D12"/>',
};

// The Amal brand owl as static SVG, in the same shapes and poses as the
// LivingOwl rig. Shared by the scripts that draw email art and app icons.

import { OWL_BODY, OWL_CAP_BAND, OWL_CAP_TOP, OWL_FACE } from "../../src/lib/brand-morph-paths.ts";

const EYE_L = { x: 257, y: 305 };
const EYE_R = { x: 383, y: 305 };

/** The brand owl, frozen in one pose. Angles match the LivingOwl rig. */
export function owl({ head = 0, wingL = 0, wingR = 0, beak = 1, happy = false, gaze = { x: -8, y: 2 }, belly = "" }) {
  const eyes = happy
    ? `<g fill="none" stroke="#171717" stroke-width="15" stroke-linecap="round">
         <path d="M222 322Q257 268 292 322" /><path d="M348 322Q383 268 418 322" /></g>`
    : `<ellipse cx="${EYE_L.x}" cy="${EYE_L.y}" rx="57" ry="65" fill="#fff" />
       <ellipse cx="${EYE_R.x}" cy="${EYE_R.y}" rx="57" ry="65" fill="#fff" />
       <g transform="translate(${gaze.x} ${gaze.y})">
         <circle cx="${EYE_L.x + 12}" cy="${EYE_L.y + 1}" r="36" fill="#000" />
         <circle cx="${EYE_R.x + 12}" cy="${EYE_R.y + 1}" r="36" fill="#000" />
         <circle cx="${EYE_L.x + 27}" cy="${EYE_L.y - 18}" r="13" fill="#fff" />
         <circle cx="${EYE_R.x + 27}" cy="${EYE_R.y - 18}" r="13" fill="#fff" />
       </g>`;
  return `
    <ellipse cx="320" cy="532" rx="128" ry="14" fill="#000" opacity="0.12" />
    <ellipse cx="264" cy="509" rx="30" ry="18" fill="#F59E0B" />
    <ellipse cx="376" cy="509" rx="30" ry="18" fill="#F59E0B" />
    <g transform="rotate(${wingL} 182 318)"><path d="M190 300C150 318 132 382 150 440C160 470 186 470 196 440Z" fill="#A01028" /></g>
    <g transform="rotate(${wingR} 458 318)"><path d="M450 300C490 318 508 382 490 440C480 470 454 470 444 440Z" fill="#A01028" /></g>
    <path d="${OWL_BODY}" fill="#D21034" />
    <ellipse cx="320" cy="438" rx="86" ry="59" fill="#FFF5F5" />
    ${belly}
    <g transform="rotate(${head} 320 340)">
      <ellipse cx="190" cy="205" rx="36" ry="49" fill="#A01028" />
      <ellipse cx="450" cy="205" rx="36" ry="49" fill="#A01028" />
      <path d="${OWL_FACE}" fill="#E8334F" />
      ${eyes}
      <ellipse cx="320" cy="371" rx="28" ry="22" fill="#F59E0B" />
      <path d="M292 371Q320 412 348 371" fill="#E08A05" transform="translate(0 371) scale(1 ${beak}) translate(0 -371)" />
      <path d="${OWL_CAP_BAND}" fill="#171717" />
      <path d="${OWL_CAP_TOP}" fill="#007229" />
      <circle cx="320" cy="126" r="17" fill="#171717" />
      <path d="M320 126Q372 144 394 205" fill="none" stroke="#F59E0B" stroke-width="14" stroke-linecap="round" />
      <ellipse cx="400" cy="222" rx="19" ry="25" fill="#F59E0B" />
    </g>`;
}

/** Places an owl so its feet stand at (x, y), `height` pixels tall. */
export function standing(x, y, height, svg) {
  const s = height / 440;
  return `<g transform="translate(${x - 320 * s} ${y - 527 * s}) scale(${s})">${svg}</g>`;
}

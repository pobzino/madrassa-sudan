// Draws the illustrations used in automated emails: the Amal owl in a few
// poses on the same sunny meadow as the home page. Email apps can't show SVG
// or run animations, so each scene is saved as a small PNG in public/email.
//
//   node scripts/render-email-art.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { owl, standing } from "./lib/brand-owl.mjs";

const OUT = path.resolve(import.meta.dirname, "../public/email");
const W = 560;
const H = 260;


const sun = (x, y) => `
  <g stroke="#ffd23f" stroke-width="3" stroke-linecap="round">
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return `<line x1="${x + Math.cos(a) * 24}" y1="${y + Math.sin(a) * 24}" x2="${x + Math.cos(a) * 31}" y2="${y + Math.sin(a) * 31}" />`;
    }).join("")}
  </g>
  <circle cx="${x}" cy="${y}" r="19" fill="#ffe16b" />`;

const cloud = (x, y, s, opacity) => `
  <g fill="#fff" opacity="${opacity}" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="40" ry="15" /><ellipse cx="34" cy="6" rx="30" ry="11" /><ellipse cx="-30" cy="7" rx="24" ry="10" />
  </g>`;

const tree = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-3" y="-4" width="6" height="22" rx="3" fill="#b78b5e" />
    <circle cx="0" cy="-14" r="15" fill="#74c08d" /><circle cx="-7" cy="-8" r="9" fill="#84cb9d" /><circle cx="7" cy="-8" r="9" fill="#84cb9d" />
  </g>`;

const meadow = ({ withSun = true } = {}) => `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e4efff" /><stop offset="0.45" stop-color="#eef0fb" /><stop offset="0.8" stop-color="#eef6ee" /><stop offset="1" stop-color="#dcefdd" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)" />
  ${withSun ? sun(486, 52) : ""}
  ${cloud(92, 40, 1, 0.95)}${cloud(330, 26, 0.7, 0.75)}${cloud(200, 82, 0.55, 0.6)}
  <g transform="translate(0 40)">
  <path d="M0 150C110 118 200 124 290 146S460 176 560 136V${H}H0Z" fill="#d6ecd9" />
  ${tree(70, 140, 0.9)}${tree(96, 146, 0.65)}${tree(470, 150, 0.85)}${tree(500, 152, 0.6)}
  <path d="M0 172C120 150 220 154 330 170S470 184 560 160V${H}H0Z" fill="#bfe0c6" />
  <path d="M0 194C130 178 250 182 360 192S490 198 560 184V${H}H0Z" fill="#aed7b6" />
  </g>`;

const OWL_X = 280;
const OWL_FEET = 244;
const OWL_H = 190;
// Props drawn around a smaller owl, scaled up to sit around this one.
const around = (svg) => `<g transform="translate(280 140) scale(1.3) translate(-280 -95)">${svg}</g>`;

const confetti = (pieces) =>
  pieces
    .map(([x, y, r, c, w = 7, h = 11]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${c}" transform="rotate(${r} ${x + w / 2} ${y + h / 2})" />`)
    .join("");

const CONFETTI = confetti([
  [182, 54, 20, "#D21034"], [214, 98, -30, "#F59E0B"], [168, 132, 45, "#007229"], [236, 36, -12, "#EC4899"],
  [356, 44, 30, "#007229"], [384, 96, -40, "#D21034"], [402, 60, 15, "#F59E0B"], [340, 128, 60, "#EC4899"],
  [150, 90, -20, "#FBBF24", 9, 6], [420, 120, 25, "#00913D", 9, 6], [262, 22, 40, "#FBBF24", 9, 6], [312, 30, -35, "#D21034", 9, 6],
]);

// Bunting in the Sudanese flag colours, strung across the sky.
const bunting = (() => {
  const colours = ["#D21034", "#ffffff", "#171717", "#007229"];
  const flags = [];
  for (let i = 0; i < 14; i++) {
    const x = 18 + i * 38;
    const y = 4 + 8 * Math.sin((i / 13) * Math.PI);
    flags.push(`<path d="M${x} ${y}L${x + 26} ${y + 1}L${x + 13} ${y + 26}Z" fill="${colours[i % 4]}" stroke="rgba(0,0,0,.06)" />`);
  }
  return `<path d="M0 3Q280 26 560 3" fill="none" stroke="#b78b5e" stroke-width="2" />${flags.join("")}`;
})();

const sparkle = (x, y, s, c) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12C2 -3 3 -2 12 0C3 2 2 3 0 12C-2 3 -3 2 -12 0C-3 -2 -2 -3 0 -12Z" fill="${c}" />`;

const heart = (x, y, s, c) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6C-10 -2 -12 -10 -6 -13C-3 -14 -1 -12 0 -10C1 -12 3 -14 6 -13C12 -10 10 -2 0 6Z" fill="${c}" />`;

// A small chalkboard on an easel, for the teacher scenes.
const easel = `
  <g transform="translate(372 116) scale(1.2)">
    <path d="M14 70L4 106M106 70L116 106M60 70V104" stroke="#9c6026" stroke-width="5" stroke-linecap="round" />
    <rect x="0" y="0" width="120" height="76" rx="8" fill="#c27d33" />
    <rect x="7" y="7" width="106" height="62" rx="4" fill="#11683a" />
    <text x="60" y="34" text-anchor="middle" font-family="Chalkboard SE, Chalkboard, Comic Sans MS, sans-serif" font-size="19" fill="#fffdf2">1 + 2 = 3</text>
    <text x="60" y="58" text-anchor="middle" font-family="Chalkboard SE, Chalkboard, Comic Sans MS, sans-serif" font-size="17" fill="#FDE68A">A b c ✓</text>
  </g>`;

// An open book held against the belly.
const book = `
  <g>
    <path d="M232 418L320 436L408 418V500L320 518L232 500Z" fill="#007229" />
    <path d="M240 414L318 430V506L240 492Z" fill="#fffdf2" />
    <path d="M400 414L322 430V506L400 492Z" fill="#ffffff" />
    <path d="M254 440L304 450M254 458L304 468M254 476L296 484M336 450L386 440M336 468L386 458M336 484L380 476" stroke="#c7d2c9" stroke-width="5" stroke-linecap="round" />
  </g>`;

const SCENES = {
  // Waving hello.
  welcome: meadow() + standing(OWL_X, OWL_FEET, OWL_H, owl({ head: 7, wingR: -118, beak: 1.2 })),
  // A teacher owl beside its chalkboard.
  teacher: meadow() + easel + standing(OWL_X - 30, OWL_FEET, OWL_H, owl({ head: 6, wingR: -96, beak: 1.15, gaze: { x: 4, y: 0 } })),
  // A week of learning: confetti, bunting and a happy dance.
  celebrate:
    meadow({ withSun: false }) + around(CONFETTI) + bunting + standing(OWL_X, OWL_FEET, OWL_H, owl({ head: 6, wingL: 30, wingR: -138, beak: 1.4, happy: true })),
  // Waiting with a book open.
  missed: meadow() + standing(OWL_X, OWL_FEET, OWL_H, owl({ head: -6, wingL: 16, wingR: -16, gaze: { x: -6, y: 16 }, belly: book })),
  // Thanking a volunteer.
  thanks:
    meadow() +
    around(
      heart(196, 70, 1.3, "#D21034") + heart(372, 56, 1.1, "#EC4899") + heart(400, 110, 0.9, "#D21034") +
        sparkle(170, 118, 0.8, "#F59E0B") + sparkle(226, 34, 0.7, "#FBBF24") + sparkle(350, 128, 0.7, "#F59E0B"),
    ) +
    standing(OWL_X, OWL_FEET, OWL_H, owl({ head: 8, wingL: 28, wingR: -128, beak: 1.3, happy: true })),
};

await mkdir(OUT, { recursive: true });
// Uses the installed Chrome, so no Playwright browser download is needed.
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
for (const [name, body] of Object.entries(SCENES)) {
  await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg></body></html>`);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const png = await sharp(shot).png({ palette: true, quality: 92, effort: 10, dither: 0.6 }).toBuffer();
  await writeFile(path.join(OUT, `${name}.png`), png);
  console.log(`${name}.png ${(png.length / 1024).toFixed(1)} KB`);
}
await browser.close();

// Draws the app icons: the navbar logo's owl (OwlTutorIcon in
// src/components/illustrations.tsx) standing on a meadow under the home page
// hero's sky. One scene, framed for each use:
//   public/icons/icon-192.png, icon-512.png   (home screen, install prompts, emails)
//   public/icons/icon-maskable-512.png       (Android, owl inside the safe zone)
//   src/app/apple-icon.png                   (iPhone home screen)
//   src/app/icon.png                         (browser tab)
//
//   node scripts/render-app-icons.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

// OwlTutorIcon, as drawn in the navbar logo (64×64; feet rest at y≈62.5).
const LOGO_OWL = `
  <ellipse cx="14" cy="18" rx="5" ry="7" fill="#a01028" />
  <ellipse cx="50" cy="18" rx="5" ry="7" fill="#a01028" />
  <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />
  <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />
  <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />
  <ellipse cx="23" cy="32" rx="8" ry="9" fill="white" />
  <ellipse cx="41" cy="32" rx="8" ry="9" fill="white" />
  <circle cx="25" cy="32" r="5" fill="#000000" />
  <circle cx="27" cy="30" r="2" fill="white" />
  <circle cx="39" cy="32" r="5" fill="#000000" />
  <circle cx="41" cy="30" r="2" fill="white" />
  <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />
  <path d="M28 42 Q32 48 36 42" fill="#E08A05" />
  <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
  <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
  <path d="M8 12l24 8 24-8" stroke="#005C22" stroke-width="1" fill="none" />
  <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
  <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" fill="none" />
  <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />
  <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
  <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />`;
const LOGO_TOP = 6;
const LOGO_FEET = 62.5;

/** The logo owl, `height` pixels tall from cap to feet, feet resting at (x, y), with a soft shadow. */
function logoOwl(x, y, height) {
  const scale = height / (LOGO_FEET - LOGO_TOP);
  return `
  <ellipse cx="${x}" cy="${y}" rx="${scale * 17}" ry="${scale * 2.4}" fill="#000" opacity="0.1" />
  <g transform="translate(${x - 32 * scale} ${y - LOGO_FEET * scale}) scale(${scale})">${LOGO_OWL}</g>`;
}

const ROOT = path.resolve(import.meta.dirname, "..");
const S = 512;

/** The hero sky, a warm glow, two rolling hills and the owl. */
function scene({ owlHeight, feetY, hillY }) {
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e4efff" /><stop offset="0.26" stop-color="#eef0fb" /><stop offset="0.52" stop-color="#eef6ee" />
      <stop offset="0.76" stop-color="#dcefdd" /><stop offset="1" stop-color="#cde8d2" />
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#fff6cd" stop-opacity="0.9" /><stop offset="1" stop-color="#fff6cd" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#sky)" />
  <rect width="${S}" height="${S}" fill="url(#glow)" />
  <path d="M0 ${hillY - 34}C120 ${hillY - 70} 250 ${hillY - 60} 350 ${hillY - 38}S470 ${hillY - 18} 512 ${hillY - 46}V${S}H0Z" fill="#bfe0c6" />
  <path d="M0 ${hillY}C140 ${hillY - 24} 300 ${hillY - 20} 400 ${hillY - 6}S490 ${hillY + 4} 512 ${hillY - 8}V${S}H0Z" fill="#aed7b6" />
  ${logoOwl(S / 2, feetY, owlHeight)}`;
}

const ICONS = [
  { file: "public/icons/icon-512.png", size: 512, frame: { owlHeight: 360, feetY: 452, hillY: 430 } },
  { file: "public/icons/icon-192.png", size: 192, frame: { owlHeight: 360, feetY: 452, hillY: 430 } },
  // Android crops maskable icons to a circle or squircle: keep the owl in the middle 80%.
  { file: "public/icons/icon-maskable-512.png", size: 512, frame: { owlHeight: 270, feetY: 400, hillY: 392 } },
  // iPhones round the corners themselves, so this stays square.
  { file: "src/app/apple-icon.png", size: 180, frame: { owlHeight: 360, feetY: 452, hillY: 430 } },
  // Tiny in a browser tab: the owl fills the frame.
  { file: "src/app/icon.png", size: 64, frame: { owlHeight: 430, feetY: 496, hillY: 470 } },
];

// Uses the installed Chrome, so no Playwright browser download is needed.
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 2 });
for (const icon of ICONS) {
  await page.setContent(
    `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${scene(icon.frame)}</svg></body></html>`,
  );
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: S, height: S } });
  const png = await sharp(shot).resize(icon.size, icon.size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(ROOT, icon.file), png);
  console.log(`${icon.file} ${icon.size}px ${(png.length / 1024).toFixed(1)} KB`);
}
await browser.close();

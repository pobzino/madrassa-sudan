// Draws the app icons: the brand owl standing on a meadow under the home
// page hero's sky. One scene, framed for each use:
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
import { owl, standing } from "./lib/brand-owl.mjs";

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
  ${standing(S / 2, feetY, owlHeight, owl({ gaze: { x: -12, y: 4 } }))}`;
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

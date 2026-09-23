// Read-only browser checks. Run against a preview with AMAL_SITE_URL set.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.AMAL_SITE_URL || 'http://localhost:3001';
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const screenshots = path.join(tmpdir(), `amal-mobile-ui-${engine}`);
await mkdir(screenshots, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch({
  ...(engine === 'webkit' && process.env.WEBKIT_EXECUTABLE_PATH ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH } : {}),
  ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});

try {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 1000, hasTouch: viewport.width < 1000 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('amal-school-has-selected-language', 'true');
      localStorage.setItem('amal-school-language', 'en');
    });
    await page.goto(`${baseURL}/auth/signup?role=parent`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Country / region Sudan' }).click();
    await page.getByRole('searchbox').fill('United');
    await page.getByRole('button', { name: 'United Kingdom +44' }).click();
    assert(await page.getByRole('button', { name: 'Country / region United Kingdom' }).isVisible());
    await page.locator('label[for="parentWhatsapp"]').getByText('+44', { exact: true }).waitFor();
    assert(await page.locator('#parentWhatsapp').isVisible());
    assert(await page.getByRole('button', { name: 'Remove a child' }).isDisabled());
    await page.getByRole('combobox', { name: 'Child 1', exact: true }).selectOption('6');
    for (let count = 2; count <= 8; count++) await page.getByRole('button', { name: 'Add a child' }).click();
    assert.equal(await page.getByLabel('Number of eligible children', { exact: true }).textContent(), '8');
    assert.equal(await page.locator('select[aria-label^="Child"]').count(), 8);
    assert(await page.getByRole('button', { name: 'Add a child' }).isDisabled());
    for (let count = 7; count >= 1; count--) await page.getByRole('button', { name: 'Remove a child' }).click();
    assert.equal(await page.getByRole('combobox', { name: 'Child 1', exact: true }).inputValue(), '6');
    await page.getByRole('button', { name: 'Country / region United Kingdom' }).click();
    await page.getByRole('searchbox').fill('249');
    await page.getByRole('button', { name: 'Sudan +249' }).click();
    await page.getByRole('button', { name: 'Country / region Sudan' }).click();
    await page.screenshot({ path: path.join(screenshots, `country-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'عربي', exact: true }).click();
    await page.getByRole('button', { name: 'الدولة أو المنطقة السودان' }).click();
    await page.getByRole('searchbox').fill('مصر');
    await page.getByRole('button', { name: 'مصر +20' }).click();

    await page.goto(`${baseURL}/sample-lesson`, { waitUntil: 'networkidle' });
    const player = page.locator('[data-sim-player]');
    await player.waitFor();
    const timeline = page.getByRole('slider', { name: 'Seek' });
    await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
    assert.equal(Number(await timeline.inputValue()), 10_000);
    assert.match(await player.getByRole('status').textContent(), /0:10/);
    await page.getByRole('button', { name: 'Rewind 10 seconds' }).click();
    assert.equal(Number(await timeline.inputValue()), 0);
    if (viewport.width < 1000) {
      const rect = await timeline.boundingBox();
      await page.touchscreen.tap(rect.x + rect.width * 0.2, rect.y + rect.height / 2);
      assert(Number(await timeline.inputValue()) > 1000, 'Touch seeking must change the playback position');
    } else {
      await timeline.focus();
      await timeline.press('ArrowRight');
      assert(Number(await timeline.inputValue()) > 0, 'Keyboard seeking must work');
    }
    const beforeFullscreen = await timeline.inputValue();
    await page.evaluate(() => Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined }));
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    const box = await player.boundingBox();
    assert.equal(Math.round(box.width), viewport.width);
    assert.equal(Math.round(box.height), viewport.height);
    assert.equal(Math.round(box.x), 0);
    assert.equal(Math.round(box.y), 0);
    const exit = page.getByRole('button', { name: 'Exit fullscreen' });
    const exitBox = await exit.boundingBox();
    assert(exitBox.y + exitBox.height <= viewport.height + 1, 'Fullscreen exit must remain in view');
    assert.equal(await timeline.inputValue(), beforeFullscreen, 'Fullscreen must preserve playback position');
    await page.screenshot({ path: path.join(screenshots, `fullscreen-${viewport.width}.png`) });
    await exit.click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    await player.screenshot({ path: path.join(screenshots, `player-${viewport.width}.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${viewport.width}x${viewport.height}: signup, Arabic, touch/keyboard seek, fullscreen`);
    await context.close();
  }

  // Hold media until Play has been tapped, as on browsers that defer preload.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('amal-school-has-selected-language', 'true');
    localStorage.setItem('amal-school-language', 'ar');
  });
  let releaseMedia;
  const mediaGate = new Promise((resolve) => { releaseMedia = resolve; });
  await page.route('**/storage/**', async (route) => {
    if (new URL(route.request().url()).pathname.includes('/sim-audio/')) await mediaGate;
    await route.continue();
  });
  await page.goto(`${baseURL}/sample-lesson`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'English', exact: true }).waitFor();
  await page.locator('[data-sim-player]').waitFor();
  assert(await page.getByRole('button', { name: 'Play', exact: true }).isEnabled());
  await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Seek"]')?.value === '10000');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel loading' }).waitFor();
  releaseMedia();
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && !audio.paused && audio.currentTime > 10.2;
  }, null, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  console.log(`PASS ${engine}: deferred audio preload starts from the selected position`);
  await context.close();
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}

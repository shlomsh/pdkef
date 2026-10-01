import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';

// SNG-21 PROBE 3, throwaway. Linux rounds 1 and 2: gestureSourceType 'touch'
// never zooms there; the default source does, but not under the app's resting
// maximum-scale=1 even with the meta loosened. Here, with the clamp on (the
// spec's own config), which way of getting Chromium to apply a loosened meta
// works with a gesture that can zoom?

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];
test.use({ ...pixel7, userAgent: devices['iPhone 14'].userAgent });

const state = (page) => page.evaluate(() => ({
  scale: window.visualViewport.scale,
  meta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
}));
const loosen = (page) => page.evaluate(() => {
  const meta = document.querySelector('meta[name="viewport"]');
  meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
});
const frames = (page, n = 2) => page.evaluate(async (count) => {
  for (let i = 0; i < count; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
}, n);

const PREPS = {
  'loosen only': async (page) => { await loosen(page); },
  'loosen + 101vh nudge': async (page) => {
    await page.evaluate(async () => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
      const root = document.documentElement;
      root.style.setProperty('min-height', '101vh');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      root.style.removeProperty('min-height');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  },
  'loosen + 2s of real time': async (page) => { await loosen(page); await page.waitForTimeout(2000); },
  'loosen + viewport size nudge (pinch inside the app\'s 250ms)': async (page) => {
    await loosen(page);
    const size = page.viewportSize();
    await page.setViewportSize({ width: size.width + 1, height: size.height });
    await page.setViewportSize(size);
  },
  'drop the limits + 101vh nudge': async (page) => {
    await page.evaluate(async () => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/, *maximum-scale=1(?![.\d])/, ''));
      const root = document.documentElement;
      root.style.setProperty('min-height', '101vh');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      root.style.removeProperty('min-height');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  },
};

const GESTURES = {
  'default-source pinch': (cdp, p) => cdp.send('Input.synthesizePinchGesture', { x: p.x, y: p.y, scaleFactor: 2, relativeSpeed: 300 }),
  'setPageScaleFactor 2': (cdp) => cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }),
  'two-finger dispatchTouchEvent': async (cdp, p) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x - 20, y: p.y, id: 1 }, { x: p.x + 20, y: p.y, id: 2 }] });
    for (let i = 1; i <= 12; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x - 20 - i * 6, y: p.y, id: 1 }, { x: p.x + 20 + i * 6, y: p.y, id: 2 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  },
};

for (const [prepName, prepare] of Object.entries(PREPS)) {
  for (const [gestureName, gesture] of Object.entries(GESTURES)) {
    test(`probe: ${prepName} / ${gestureName}`, async ({ page }) => {
      await page.goto('/sign/?next=1');
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
      const chooser = page.waitForEvent('filechooser');
      await page.getByText('Choose file', { exact: true }).click();
      await (await chooser).setFiles({ name: 'practice-form.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(PRACTICE_FORM) });
      await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
      const first = page.locator('[data-fill-input]').first();
      await first.focus();
      const box = await first.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const seen = [`${process.platform} start ${JSON.stringify(await state(page))}`];
      await prepare(page);
      seen.push(`prepared ${JSON.stringify(await state(page))}`);
      await gesture(cdp, { x: box.x + 10, y: box.y + box.height / 2 });
      await page.waitForTimeout(600);
      seen.push(`after ${JSON.stringify(await state(page))}`);
      expect((await state(page)).scale, seen.join('\n')).toBeGreaterThan(1.4);
    });
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';

// SNG-21 PROBE 2, throwaway. Round 1 (CI, Linux): every way of loosening the
// meta left a synthesized pinch at 1x, and the app's touch handler did fire.
// So: does a pinch zoom on Linux at all in this setup, and which device
// configuration / gesture source / CDP call does?

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];

const CONFIGS = {
  'pixel7 + iPhone UA (the spec today)': { ...pixel7, userAgent: devices['iPhone 14'].userAgent },
  'pixel7, own UA (the app leaves the meta alone)': { ...pixel7 },
  'toolbar-spec config: 440x956 isMobile hasTouch': { hasTouch: true, isMobile: true, viewport: { width: 440, height: 956 } },
};

const state = (page) => page.evaluate(() => ({
  scale: window.visualViewport.scale,
  w: Math.round(window.visualViewport.width),
  meta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
  touch: navigator.maxTouchPoints,
  dpr: window.devicePixelRatio,
  iw: window.innerWidth,
}));

const HOWS = {
  'synthesizePinchGesture touch': async (cdp, p) => cdp.send('Input.synthesizePinchGesture', { x: p.x, y: p.y, scaleFactor: 2, relativeSpeed: 1000, gestureSourceType: 'touch' }),
  'synthesizePinchGesture default source': async (cdp, p) => cdp.send('Input.synthesizePinchGesture', { x: p.x, y: p.y, scaleFactor: 2, relativeSpeed: 300 }),
  'synthesizePinchGesture touch, slow': async (cdp, p) => cdp.send('Input.synthesizePinchGesture', { x: p.x, y: p.y, scaleFactor: 2, relativeSpeed: 200, gestureSourceType: 'touch' }),
  'setPageScaleFactor 2': async (cdp) => cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }),
  'dispatchTouchEvent two fingers apart': async (cdp, p) => {
    const down = [{ x: p.x - 20, y: p.y, id: 1 }, { x: p.x + 20, y: p.y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: down });
    for (let i = 1; i <= 12; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x - 20 - i * 6, y: p.y, id: 1 }, { x: p.x + 20 + i * 6, y: p.y, id: 2 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  },
};

for (const [configName, config] of Object.entries(CONFIGS)) {
  test.describe(configName, () => {
    test.use(config);
    for (const [howName, how] of Object.entries(HOWS)) {
      test(`probe: ${howName}`, async ({ page }) => {
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
        // Loosen like the spec does, so a clamp is never the reason (a no-op without the app's clamp).
        await page.evaluate(() => {
          const meta = document.querySelector('meta[name="viewport"]');
          meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
        });
        await page.waitForTimeout(500);
        await how(cdp, { x: box.x + 10, y: box.y + box.height / 2 });
        await page.waitForTimeout(600);
        const after = await state(page);
        seen.push(`after ${JSON.stringify(after)}`);
        expect(after.scale, seen.join('\n')).toBeGreaterThan(1.4);
      });
    }
  });
}

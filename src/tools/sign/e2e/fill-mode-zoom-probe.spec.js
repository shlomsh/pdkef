import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';

// SNG-21 PROBE, throwaway: which way of getting a synthesized pinch past fill
// mode's resting `maximum-scale=1` works on CI's Linux Chromium? One fresh page
// per strategy; a failure prints what each attempt saw. Delete with the fix.

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];
test.use({ ...pixel7, userAgent: devices['iPhone 14'].userAgent });

const frames = (page, n = 2) => page.evaluate(async (count) => {
  for (let i = 0; i < count; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
}, n);
const state = (page) => page.evaluate(() => ({
  scale: window.visualViewport.scale,
  meta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
}));

async function pinch(page, point, scaleFactor) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x: point.x, y: point.y, scaleFactor, relativeSpeed: 1000, gestureSourceType: 'touch' });
  await cdp.detach();
}

const STRATEGIES = {
  'just pinch, the app strips the limits on touchstart': async () => {},
  'loosen to maximum-scale=5, no layout nudge': async (page) => {
    await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
    });
  },
  'loosen, then wait two seconds of real time': async (page) => {
    await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
    });
    await page.waitForTimeout(2000);
  },
  'loosen, then resend the device metrics override': async (page) => {
    await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 839, deviceScaleFactor: 2.625, mobile: true });
    await cdp.detach();
    await frames(page);
  },
  'replace the meta element with a loosened one': async (page) => {
    await page.evaluate(() => {
      const old = document.querySelector('meta[name="viewport"]');
      const next = document.createElement('meta');
      next.name = 'viewport';
      next.content = 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5';
      old.remove();
      document.head.appendChild(next);
    });
    await frames(page);
  },
  'loosen, then nudge layout with a 101vh min-height for one frame (the current stand-in)': async (page) => {
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
};

for (const [name, prepare] of Object.entries(STRATEGIES)) {
  test(`probe: ${name}`, async ({ page }) => {
    await page.goto('/sign/?next=1');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    await (await chooser).setFiles({ name: 'practice-form.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(PRACTICE_FORM) });
    await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
    const first = page.locator('[data-fill-input]').first();
    await first.focus();
    const box = await first.boundingBox();

    const seen = [`${process.platform}, start ${JSON.stringify(await state(page))}`];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await prepare(page);
      const before = await state(page);
      await pinch(page, { x: box.x + 10, y: box.y + box.height / 2 }, 2);
      await page.waitForTimeout(400);
      const after = await state(page);
      seen.push(`#${attempt} before ${JSON.stringify(before)} -> after ${JSON.stringify(after)}`);
      if (after.scale > 1.4) break;
    }
    expect((await state(page)).scale, seen.join('\n')).toBeGreaterThan(1.4);
  });
}

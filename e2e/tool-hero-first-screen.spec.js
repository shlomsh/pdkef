import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// HERO guard (docs/tool-hero-show-the-verb.md, "Guards"): on the eight page-grid tools the whole
// first screen fits the viewport at desktop sizes (h1, the sheet, Choose files), How it works sits
// below the fold, nothing overflows sideways and the verb animation shifts nothing. A file dropped
// on the hero's text column loads, a drag over the page lights the stage, and reduced motion stops
// the verb. jsdom has no layout, viewport, animation clock, layout-shift entries or media emulation,
// so none of this can be proved there.

const ROUTES = ['/merge/', '/split/', '/compress/', '/compress-image/', '/pdf-to-image/', '/image-to-pdf/', '/unlock/', '/edit-pdf/'];
const EXTRA_SIZES = new Set(['/merge/', '/image-to-pdf/']);
const SIZES = [
  { width: 1280, height: 680, belowFold: true },
  { width: 1440, height: 820, belowFold: true },
  { width: 1920, height: 1040, belowFold: false },
];

const HYDRATED = 'astro-island:not([ssr]) [data-empty-state]';
const PICKER = '[data-empty-state] label:has(input[type="file"])';
const PDF = readFileSync(new URL('../src/lib/__fixtures__/num-1.pdf', import.meta.url));

async function open(page, route) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch { /* private mode */ }
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(route);
  await expect(page.locator(HYDRATED), route).toBeVisible();
}

// Fully inside the viewport (a rect, not a text width).
async function expectInViewport(page, locator, label) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  expect(box, label).not.toBeNull();
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${label} bottom`).toBeLessThanOrEqual(vp.height);
}

test.describe('first screen', () => {
  for (const route of ROUTES) {
    const sizes = EXTRA_SIZES.has(route) ? SIZES : [SIZES[1]];
    for (const size of sizes) {
      test(`${route} at ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await open(page, route);
        await expectInViewport(page, page.locator('h1').first(), 'h1');
        await expectInViewport(page, page.locator('[data-empty-state]').first(), 'sheet');
        await expectInViewport(page, page.locator(PICKER).first(), 'Choose files');
        if (size.belowFold) {
          const top = await page.locator('#how-it-works').evaluate((el) => el.getBoundingClientRect().top);
          expect(top, 'How it works starts at or below the fold').toBeGreaterThanOrEqual(size.height);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => window.__cls), 'layout shift while the verb plays').toBeLessThan(0.001);
      });
    }
  }
});

test('a file dropped on the hero text column loads in the tool', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/merge/');
  const dt = await page.evaluateHandle((bytes) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array(bytes)], 'num-1.pdf', { type: 'application/pdf' }));
    return d;
  }, [...PDF]);
  const sub = page.locator('[data-hero-sub]').first();
  await sub.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(page.locator('[data-dragging]').first()).toBeVisible();
  await sub.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.locator('[data-tool-loaded]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-dragging]')).toHaveCount(0);
});

for (const route of ['/merge/', '/unlock/']) {
  test(`reduced motion leaves ${route} verb still`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 820 });
    await open(page, route);
    await expect(page.locator('[data-empty-state] div[aria-hidden="true"]').first()).toBeVisible();
    await page.waitForTimeout(500);
    const running = await page.evaluate(() => {
      const root = document.querySelector('[data-empty-state]');
      return document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.target;
        return t && root.contains(t) && a.playState === 'running';
      }).length;
    });
    expect(running, 'running animations in the sheet').toBe(0);
  });
}

test('dragging over the page lights the stage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/image-to-pdf/');
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    return d;
  });
  const shadow = () => page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).boxShadow);
  await page.locator('h1').first().dispatchEvent('dragenter', { dataTransfer: dt });
  await expect.poll(shadow).toContain('inset');
  await page.locator('h1').first().dispatchEvent('dragleave', { dataTransfer: dt });
  await expect.poll(shadow).not.toContain('inset');
});

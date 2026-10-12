import { test, expect } from '@playwright/test';

// SITE-43: on narrow desktop windows the demo column must be wide enough for
// the stage (note column + gap + phone), so nothing overflows the page, leaves
// its column or runs under the launcher.
const viewports = [
  { width: 1024, height: 768 },
  { width: 1024, height: 832 },
  { width: 1060, height: 832 },
  { width: 1100, height: 900 },
  { width: 1024, height: 1200 },
  { width: 1280, height: 800 },
];

test.describe('home demo fits its column on desktop windows', () => {
  for (const path of ['/', '/he/']) {
    for (const viewport of viewports) {
      test(`${path} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const problems = await page.evaluate(() => {
          const out = [];
          const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
          const de = document.documentElement;
          if (de.scrollWidth > de.clientWidth) {
            out.push(`page overflows: scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
          }
          const track = document.querySelector('.demo-track').getBoundingClientRect();
          const launcher = document.querySelector('.workspace-launcher').getBoundingClientRect();
          const describe = (el, r) =>
            `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').trim()} `
            + `[${Math.round(r.left)}..${Math.round(r.right)}]`;
          const els = document.querySelectorAll('.demo-track [data-hero-track="sign"] *');
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.left < track.left - 6 || r.right > track.right + 6) {
              out.push(`outside track [${Math.round(track.left)}..${Math.round(track.right)}]: ${describe(el, r)}`);
            }
            if (r.right > window.innerWidth) {
              out.push(`past viewport ${window.innerWidth}: ${describe(el, r)}`);
            }
            const clear = rtl ? r.right <= launcher.left : r.left >= launcher.right;
            if (!clear) {
              out.push(`overlaps launcher [${Math.round(launcher.left)}..${Math.round(launcher.right)}]: ${describe(el, r)}`);
            }
          }
          return out;
        });

        expect(problems, problems.slice(0, 12).join('\n')).toEqual([]);
      });
    }
  }
});

// SITE-43: ten tools no longer fit the dock's 20px gaps at 960-1027px, and an
// end tool's centred tooltip hung past the page edge.
const dockViewports = [
  { width: 960, height: 800 },
  { width: 1000, height: 800 },
  { width: 1024, height: 768 },
  { width: 1060, height: 832 },
  { width: 1280, height: 800 },
];

test.describe('dock fits the page', () => {
  for (const path of ['/', '/he/']) {
    for (const viewport of dockViewports) {
      test(`${path} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const layout = await page.evaluate(() => {
          const de = document.documentElement;
          const cards = [...document.querySelectorAll('.home-dock .app-card')].map((el) => {
            const r = el.getBoundingClientRect();
            return { tool: el.getAttribute('data-tool'), left: Math.round(r.left), right: Math.round(r.right) };
          });
          return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, innerWidth: window.innerWidth, cards };
        });
        expect(layout.scrollWidth, `page overflows: scrollWidth ${layout.scrollWidth} > clientWidth ${layout.clientWidth}`)
          .toBeLessThanOrEqual(layout.clientWidth);
        const outside = layout.cards.filter((c) => c.left < 0 || c.right > layout.innerWidth);
        expect(outside, `cards outside [0..${layout.innerWidth}]: ${JSON.stringify(outside)}`).toEqual([]);

        const cards = page.locator('.home-dock .app-card');
        const n = await cards.count();
        for (const index of [0, n - 1]) {
          const card = cards.nth(index);
          await card.hover();
          await page.waitForTimeout(1200);
          const tip = await card.locator('.app-tooltip').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right), visible: getComputedStyle(el).visibility };
          });
          expect(tip.visible).toBe('visible');
          expect(
            tip.left >= 0 && tip.right <= layout.innerWidth,
            `tooltip of card ${index} [${tip.left}..${tip.right}] outside [0..${layout.innerWidth}]`,
          ).toBe(true);
        }
      });
    }
  }
});

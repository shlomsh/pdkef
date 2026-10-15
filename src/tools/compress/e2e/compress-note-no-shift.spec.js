import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// DEBT-52 - the note arrives after analyze() has read the PDF, inside the file strip. Whatever it
// turns out to be, the level options below must not move, and the strip must not change height.
// Layout shift needs a real layout engine.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, '..', '..', '..', '..', rel));
const CASES = [
  { name: 'num-1.pdf', buf: read('src/lib/__fixtures__/num-1.pdf') },
  { name: 'mixed.pdf', buf: read('src/tools/compress/__fixtures__/mixed.pdf') },
  { name: 'scan.pdf', buf: read('src/tools/compress/__fixtures__/scan.pdf') },
];

// The level group's top edge and the strip's height, sampled every frame once they exist. A shift
// from the note arriving shows up as a second distinct value. Sampling rects rather than
// layout-shift entries keeps it independent of the 500ms "recent input" exemption and of the
// empty-state -> loaded swap, which is not this ticket's.
async function open(page) {
  await page.addInitScript(() => {
    window.__tops = [];
    window.__heights = [];
    const loop = () => {
      const el = document.querySelector('[role="radiogroup"]');
      const strip = document.querySelector('[data-tool-shell]');
      if (el && strip && !document.querySelector('[data-empty-state]')) {
        const t = Math.round(el.getBoundingClientRect().top + window.scrollY);
        if (window.__tops[window.__tops.length - 1] !== t) window.__tops.push(t);
        const h = Math.round(strip.getBoundingClientRect().height);
        if (window.__heights[window.__heights.length - 1] !== h) window.__heights.push(h);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr]) [data-empty-state]').first().waitFor();
}

async function load(page, c) {
  // setInputFiles, not a click on the picker: a click is "recent input" for 500ms and layout-shift hides it.
  await page.locator('[data-empty-state] input[type="file"]').first().setInputFiles({ name: c.name, mimeType: 'application/pdf', buffer: c.buf });
  await expect(page.getByRole('radiogroup')).toBeVisible();
  await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

const sample = (page, key) => page.evaluate((k) => window[k], key);
const groupY = async (page) => (await page.getByRole('radiogroup').boundingBox()).y;
const spread = (values) => Math.max(...values) - Math.min(...values);

// Wait for a run newer than `after` to finish.
const runOf = async (page) => Number(await page.locator('[data-compress-run]').first().getAttribute('data-compress-run'));
async function waitForDone(page, after) {
  await expect.poll(async () => {
    const root = page.locator('[data-compress-status]').first();
    if ((await root.getAttribute('data-compress-status')) !== 'done') return false;
    return Number(await root.getAttribute('data-compress-run')) > after;
  }, { timeout: 30_000 }).toBe(true);
}

test.describe('compress note does not shift the options (DEBT-52)', () => {
  for (const c of CASES) {
    test(`${c.name}: the options stay put and the strip keeps its height from file set to note settled`, async ({ page }) => {
      await open(page);
      await load(page, c);
      expect(spread(await sample(page, '__tops'))).toBeLessThanOrEqual(1);
      expect(spread(await sample(page, '__heights'))).toBeLessThanOrEqual(1);
    });

    test(`${c.name}: picking Smallest then Balanced leaves the options where they were`, async ({ page }) => {
      await open(page);
      await load(page, c);
      const before = await groupY(page);
      for (const level of ['Smallest', 'Balanced']) {
        const run = await runOf(page);
        await page.getByRole('radio', { name: level }).click();
        await waitForDone(page, run);
        await page.waitForTimeout(300);
        expect(Math.abs((await groupY(page)) - before)).toBeLessThanOrEqual(1);
      }
    });
  }
});

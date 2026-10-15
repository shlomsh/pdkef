import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// DEBT-52 - the note above Compress's quality options arrives after analyze() has read the PDF.
// Whatever it turns out to be (the text-only note, the shorter image warning, or nothing once
// flatten is on), the options below must not move. Layout shift needs a real layout engine.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, '..', '..', '..', '..', rel));
const CASES = [
  { name: 'num-1.pdf', buf: read('src/lib/__fixtures__/num-1.pdf'), note: true },
  { name: 'mixed.pdf', buf: read('src/tools/compress/__fixtures__/mixed.pdf'), note: true },
  { name: 'scan.pdf', buf: read('src/tools/compress/__fixtures__/scan.pdf'), note: true },
];

// The options' top edge, sampled every frame once they exist. A shift from the note arriving (or
// going away) shows up as a second distinct value. Sampling the rect rather than layout-shift
// entries keeps it independent of the 500ms "recent input" exemption and of the empty-state ->
// loaded swap, which is not this ticket's.
async function open(page) {
  await page.addInitScript(() => {
    window.__tops = [];
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    const loop = () => {
      const el = document.querySelector('[role="radiogroup"]');
      if (el && !document.querySelector('[data-empty-state]')) {
        const t = Math.round(el.getBoundingClientRect().top + window.scrollY);
        if (window.__tops[window.__tops.length - 1] !== t) window.__tops.push(t);
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
  await expect(page.locator('[role="note"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
}

const tops = (page) => page.evaluate(() => window.__tops);

test.describe('compress note does not shift the options (DEBT-52)', () => {
  for (const c of CASES) {
    test(`${c.name}: the options stay put from file set to note settled`, async ({ page }) => {
      await open(page);
      await load(page, c);
      expect(await tops(page)).toHaveLength(1);
    });

    test(`${c.name}: turning flatten on (the note goes away) moves nothing`, async ({ page }) => {
      await open(page);
      await load(page, c);
      await page.getByRole('checkbox').first().check();
      await page.waitForTimeout(600);
      expect(await tops(page)).toHaveLength(1);
    });
  }
});

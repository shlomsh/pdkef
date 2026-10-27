import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForIsland } from '../support/tool.js';
import { makeHebrewTextPdf } from '../support/pdf.js';

// A canvas inherits `direction` from CSS, and pdf.js paints each glyph with
// `fillText` at the default `textAlign: start`, so on a dir="rtl" page every
// glyph used to land shifted left by its own advance and Hebrew words tore
// apart on /he/sign/ while /sign/ was fine. `getPdfRenderContext` forces ltr
// on the context; this is the only place that can prove it, since jsdom has
// no canvas. Same PDF, both editions, the ink must land in the same place.
//
// Not a byte-identical bitmap: measured 2026-10-20, about 1 run in 10 under
// parallel load the two editions rasterised the same glyphs with a different
// edge weight (4761 pixels, 6% of the ink mask, every one within 1px of ink
// on the other side), so a SHA-1 of the PNG failed with nothing wrong. The
// bug this guards moved every glyph by its own advance, tens of pixels. So
// the assertion is: same canvas size, and every ink pixel on
// either side has ink within NEAR_PX on the other.
test.use({ serviceWorkers: 'block' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_PAGE = '/he/sign/?next=0';

const makeTextPdf = makeHebrewTextPdf;

const NEAR_PX = 1;

// PdfPageCanvas dispatches `page-painted` after each finished paint, and
// repaints as the page's width bucket settles, so the read waits for a paint
// and then for the painting to go quiet. The listener goes in before any page
// script: /he/sign/ restores the file the English visit left in drafts and
// paints it before the test can act.
const QUIET_MS = 500;

function countPaints() {
  window.__paints = 0;
  document.addEventListener('page-painted', () => { window.__paints += 1; window.__lastPaint = performance.now(); }, true);
}

async function renderedInk(page, route, buffer) {
  await page.goto(route);
  await waitForIsland(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'text.pdf', mimeType: 'application/pdf', buffer });
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.evaluate((quiet) => window.__paints > 0 && performance.now() - window.__lastPaint > quiet, QUIET_MS), { timeout: 15_000 })
    .toBe(true);
  // One character per pixel: '1' where the page is inked (opaque and dark).
  const { width, height, mask } = await canvas.evaluate((el) => {
    const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    let out = '';
    for (let i = 0; i < data.length; i += 4) out += data[i + 3] > 0 && data[i] < 128 ? '1' : '0';
    return { width: el.width, height: el.height, mask: out };
  });
  return { width, height, mask };
}

// Ink pixels of `a` with no ink of `b` within NEAR_PX, as a count.
function strayInk(a, b) {
  let stray = 0;
  for (let i = 0; i < a.mask.length; i += 1) {
    if (a.mask[i] !== '1') continue;
    const x = i % a.width; const y = (i - x) / a.width;
    let near = false;
    for (let dy = -NEAR_PX; dy <= NEAR_PX && !near; dy += 1) {
      for (let dx = -NEAR_PX; dx <= NEAR_PX && !near; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < b.width && ny < b.height && b.mask[ny * b.width + nx] === '1') near = true;
      }
    }
    if (!near) stray += 1;
  }
  return stray;
}

test('the Hebrew edition paints a PDF page with its ink where the English one puts it', async ({ page }) => {
  const response = await page.goto(HEBREW_PAGE);
  test.skip(!response || response.status() === 404, `${HEBREW_PAGE} is not built`);
  await page.addInitScript(countPaints);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const buffer = await makeTextPdf();
  const english = await renderedInk(page, '/sign/?next=0', buffer);
  const hebrew = await renderedInk(page, HEBREW_PAGE, buffer);
  expect(`${hebrew.width}x${hebrew.height}`, 'canvas size').toBe(`${english.width}x${english.height}`);
  expect(english.mask.includes('1'), 'the English page has ink').toBe(true);
  expect({ hebrewStray: strayInk(hebrew, english), englishStray: strayInk(english, hebrew) }, `ink more than ${NEAR_PX}px from the other edition's`)
    .toEqual({ hebrewStray: 0, englishStray: 0 });
});

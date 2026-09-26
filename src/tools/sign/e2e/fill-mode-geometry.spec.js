import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Fill mode's text geometry (SNG-15, SNG-17, SIGN-38): what a person sees while
 * typing into a field is where the text stays once they leave it, the frame
 * around an empty field covers the printed field, the font list never hides the
 * text it is styling, and a digit sits at the same height in a cell whatever the
 * face. Five bugs Shlomi hit on 2026-09-26, named after the fix where there is one:
 *
 * 1. Comb digits while typing land where the committed element draws them
 *    (69a70277). The live overlay's cells inherited the page's line-height (1.6)
 *    instead of the committed element's (1.05), so every digit sat 0.275em low
 *    until blur, then jumped up.
 * 2. A field slot's frame covers the whole printed field (996d88ae). The slot was
 *    only as tall as one padded text line, short of the printed cell.
 * 3. Typed text in a plain (non-comb) field does not jump on commit: the slot's
 *    padding places the line exactly where the committed element's textarea
 *    draws it, even though the frame around it grew to cover the field; and
 *    sideways, the slot sets the text in by the same `fieldTextInset` the
 *    committed element uses, not a fixed 4px. Two tests: on a desktop and on
 *    a phone.
 * 4. On desktop the font list opens beside the element, never over it
 *    (f2ba3495). It used to hang under the toolbar's font button, which near
 *    the page's left edge put it straight over the text being styled.
 * 5. Every font puts digits at the same height in a cell (SIGN-38, 0245d8ba).
 *    The cell placement centred each font's em box, not its digits' ink, so
 *    Pacifico's digits sat about 6pt lower than Arimo's in the same cell.
 *
 * All of it is rendered layout jsdom cannot see: line-height inheritance, an
 * input's own vertical centring of its value, floating-ui's placement against
 * real rects, and glyph ink. Every assertion compares two rendered things with
 * each other (live against committed, slot against the detected field, one font
 * against another), never a pixel value measured on one platform, so it holds
 * on CI's Linux fonts as well as a Mac's (.claude/rules/tests.md).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..', '..');
const PRACTICE_FORM = path.join(REPO, 'public', 'images', 'redaction-guide', 'sample.pdf');
const FORM_101 = path.join(REPO, 'src', 'tools', 'sign', 'fields', 'corpus', 'scoring', 'forms', 'income-tax-101-2024.pdf');

// The phone the comb and frame bugs were reported on. A device scale of 3 keeps
// the ink measurements below a third of a CSS pixel apart, where the text on a
// 390px-wide page is only about 7px tall.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

// Practice-form slot keys (fillSlots.ts's slotKey: page, then the detected
// region's own left and top in page percent). Stable across viewports.
const FULL_NAME = 'slot:0:8.07:16.15';
const ID_NUMBER = 'slot:0:8.07:21.38'; // a boxed comb
const DATE_OF_BIRTH = 'slot:0:8.07:26.60'; // a plain cell at the page's left edge

async function openInFillMode(page, file, name) {
  await page.goto('/sign/?next=1');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer: fs.readFileSync(file) });
  await expect(page.locator('[data-fill-input]').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * The detected field regions of the practice form's page 1, in page percent, as
 * the production Text tool draws them (FormFieldHints.tsx puts each region's own
 * percentages on its hint's inline style). Read in a context of its own so the
 * fill-mode page under test starts with no recents.
 */
async function detectedRegions(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/sign/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'practice-form.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(PRACTICE_FORM) });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
  const regions = await page.locator('[class*="field-hint"][style*="left"]').evaluateAll((hints) => hints.map((hint) => ({
    left: parseFloat(hint.style.left),
    top: parseFloat(hint.style.top),
    width: parseFloat(hint.style.width),
    height: parseFloat(hint.style.height),
  })));
  await context.close();
  return regions;
}

/** A slot key's region, converted to viewport px against the fill-mode page overlay. */
async function regionRect(page, regions, key) {
  const [, , left, top] = key.split(':');
  const region = regions.find((r) => r.left.toFixed(2) === left && r.top.toFixed(2) === top);
  expect(region, `a detected region for ${key}`).toBeTruthy();
  const overlay = await page.locator('[class*="page-overlay"]').first().boundingBox();
  return {
    x: overlay.x + (region.left / 100) * overlay.width,
    y: overlay.y + (region.top / 100) * overlay.height,
    width: (region.width / 100) * overlay.width,
    height: (region.height / 100) * overlay.height,
  };
}

/** Per-digit rects of the comb cells under `root`, from each glyph's own text Range. */
function combGlyphRects(root) {
  return [...root.querySelectorAll('[data-text-part="comb-cell"]')].filter((cell) => cell.textContent).map((cell) => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    const r = range.getClientRects()[0];
    return { ch: cell.textContent, x: r.left, y: r.top, width: r.width, height: r.height };
  });
}

/**
 * The bounding box of the text's own ink inside `clip`, in viewport CSS px: every
 * pixel at least half way from the clip's background colour to `ink` (the text's
 * computed colour) and not off that line toward some other colour (the teal
 * frame, a printed rule). Measured on a real screenshot, decoded in the page
 * itself (a Blob and createImageBitmap need no network, so the CSP is moot).
 */
async function inkBox(page, clip, ink) {
  const scale = await page.evaluate(() => window.devicePixelRatio);
  const png = await page.screenshot({ clip, scale: 'device' });
  const box = await page.evaluate(async ({ b64, ink }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    // The background is the clip's most common colour.
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
    const axis = ink.map((v, i) => v - bg[i]);
    const axisLen2 = axis.reduce((s, v) => s + v * v, 0);
    let top = Infinity; let bottom = -Infinity; let left = Infinity; let right = -Infinity;
    let mass = 0; let sx = 0; let sy = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const d = [data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]];
        const alpha = (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / axisLen2;
        if (alpha < 0.5) continue;
        const off = Math.hypot(d[0] - alpha * axis[0], d[1] - alpha * axis[1], d[2] - alpha * axis[2]);
        if (off > 0.25 * Math.sqrt(axisLen2)) continue;
        const weight = Math.min(1, alpha);
        mass += weight; sx += weight * (x + 0.5); sy += weight * (y + 0.5);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        left = Math.min(left, x); right = Math.max(right, x + 1);
      }
    }
    return Number.isFinite(top) ? { top, bottom, left, right, cx: sx / mass, cy: sy / mass } : null;
  }, { b64: png.toString('base64'), ink });
  expect(box, 'text ink found in the clip').not.toBeNull();
  return {
    top: clip.y + box.top / scale,
    bottom: clip.y + box.bottom / scale,
    left: clip.x + box.left / scale,
    right: clip.x + box.right / scale,
    // The ink's own centre of mass: for the same glyphs drawn twice, how far
    // they moved, finer than the edges above, which a pixel of anti-aliasing
    // can flip.
    cx: clip.x + box.cx / scale,
    cy: clip.y + box.cy / scale,
  };
}

const rgbOf = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

/** A rect shrunk by `by` px on every side: inside a printed cell's own border. */
const inset = (r, by) => ({ x: r.x + by, y: r.y + by, width: r.width - 2 * by, height: r.height - 2 * by });

const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('fill mode on a phone', () => {
  test.use(PHONE);

  test('comb digits while typing land where the committed element draws them (69a70277)', async ({ page }) => {
    await openInFillMode(page, FORM_101, 'form-101.pdf');
    // Form 101's date of birth and postal code: both detected as comb runs.
    const fields = [['date of birth', 'slot:0:19.99:', '29101990'], ['postal code', 'slot:0:4.82:30.', '3785500']];
    for (const [name, prefix, digits] of fields) {
      const key = await page.locator('input[data-fill-input]').evaluateAll(
        (inputs, p) => inputs.map((i) => i.dataset.fillKey).find((k) => k.startsWith(p)), prefix,
      );
      expect(key, `a comb slot for form 101's ${name}`).toBeTruthy();
      const input = page.locator(`[data-fill-key="${key}"]`);
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      await page.keyboard.type(digits);
      // The live overlay (FieldSlot.tsx's .comb-overlay) sits right after the input.
      const live = await page.evaluate(combGlyphRects, await input.evaluateHandle((node) => node.nextElementSibling));
      expect(live.map((g) => g.ch).join(''), `${name}: the live overlay draws every digit`).toBe(digits);

      await input.evaluate((node) => node.blur());
      const committedDisplay = () => page.evaluateHandle((v) => [...document.querySelectorAll('[data-editor-element] [data-text-part="display"]')]
        .find((display) => display.querySelector('textarea')?.value === v) || null, digits);
      await expect.poll(async () => (await committedDisplay()).evaluate((display) => display !== null)).toBe(true);
      const committed = await page.evaluate(combGlyphRects, await committedDisplay());
      expect(committed.map((g) => g.ch).join('')).toBe(digits);

      live.forEach((glyph, i) => {
        const after = committed[i];
        expect(Math.abs(glyph.x - after.x), `${name}, digit ${i} "${glyph.ch}": x while typing vs committed`).toBeLessThan(1);
        expect(Math.abs(glyph.y - after.y), `${name}, digit ${i} "${glyph.ch}": y while typing vs committed`).toBeLessThan(1);
      });
    }
  });

  test('a field slot\'s frame covers the whole printed field (996d88ae)', async ({ page, browser }) => {
    const regions = await detectedRegions(browser);
    await openInFillMode(page, PRACTICE_FORM, 'practice-form.pdf');
    // A plain cell and a boxed comb: every practice-form field is taller than
    // the one padded text line the slot used to be, and the comb's line sits
    // at a different offset inside its cell than the plain cell's does.
    for (const key of [FULL_NAME, ID_NUMBER]) {
      const input = page.locator(`[data-fill-key="${key}"]`);
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      const frame = await input.boundingBox();
      const field = await regionRect(page, regions, key);
      expect(frame.y, `${key}: the frame starts at or above the field's top`).toBeLessThanOrEqual(field.y + 1);
      expect(frame.y + frame.height, `${key}: the frame reaches the field's bottom`).toBeGreaterThanOrEqual(field.y + field.height - 1);
      expect(frame.x, `${key}: the frame starts at or left of the field's left`).toBeLessThanOrEqual(field.x + 1);
      expect(frame.x + frame.width, `${key}: the frame reaches the field's right`).toBeGreaterThanOrEqual(field.x + field.width - 1);
      await input.evaluate((node) => node.blur());
    }
  });

  test('typed text in a plain field does not jump on commit', async ({ page }) => {
    // Sideways: the slot used to pad its text 4px from the cell wall while the
    // committed element pads it fieldTextInset (a quarter em), so it moved about
    // 2px on blur at 390px in Chromium and WebKit alike. FieldSlot.tsx now takes
    // the same inset.
    // Up and down: Chromium with touch emulation (hasTouch) draws this input's
    // text one CSS px lower than the same computed styles place it, and lower
    // than it draws the same input without touch (0.00px) or on a bare page
    // (0.00px); the slot's line box and the textarea's agree to 0.01px. WebKit,
    // the phone that matters, shows 0.33px (one device pixel at 3x). So the
    // vertical bound here is 1.1px, an engine allowance for Chromium only; the
    // desktop test below keeps it at 1px.
    const { before, after } = await typeAndCommitPlainField(page);
    expect(Math.abs(after.cx - before.cx), 'the text\'s horizontal position, typing vs committed').toBeLessThan(1);
    expect(Math.abs(after.cy - before.cy), 'the text\'s vertical position, typing vs committed').toBeLessThan(1.1);
  });
});

/** Types into the practice form's Full name slot, then blurs it: the typed text's ink box while in the slot, and once committed. */
async function typeAndCommitPlainField(page) {
  await openInFillMode(page, PRACTICE_FORM, 'practice-form.pdf');
  const input = page.locator(`[data-fill-key="${FULL_NAME}"]`);
  await input.scrollIntoViewIfNeeded();
  await input.focus();
  await page.keyboard.type('Ann Lee');
  // The focus ring paints outside the box; the caret is the one mark inside
  // it that is not the text, so hide it.
  await input.evaluate((node) => node.style.setProperty('caret-color', 'transparent', 'important'));
  const clip = inset(await input.boundingBox(), 1);
  const ink = rgbOf(await input.evaluate((node) => getComputedStyle(node).color));
  const before = await inkBox(page, clip, ink);

  await input.evaluate((node) => node.blur());
  const textarea = page.locator('[data-editor-element] textarea');
  await expect(textarea).toHaveValue('Ann Lee');
  expect(rgbOf(await textarea.evaluate((node) => getComputedStyle(node).color)), 'the committed text keeps the slot\'s colour').toEqual(ink);
  const after = await inkBox(page, clip, ink);
  return { before, after };
}

test.describe('fill mode on a desktop', () => {
  // The suite's desktop viewport, at a device scale that resolves ink to a third of a pixel.
  test.use({ deviceScaleFactor: 3 });

  test('typed text in a plain field does not jump on commit', async ({ page }) => {
    // The frame grew to cover the field (996d88ae); its padding is what keeps
    // the line where the committed element draws it; fieldTextInset keeps it
    // in place sideways.
    const { before, after } = await typeAndCommitPlainField(page);
    expect(Math.abs(after.cx - before.cx), 'the text\'s horizontal position, typing vs committed').toBeLessThan(1);
    expect(Math.abs(after.cy - before.cy), 'the text\'s vertical position, typing vs committed').toBeLessThan(1);
    expect(Math.abs((after.bottom - after.top) - (before.bottom - before.top)), 'the same glyphs, the same height').toBeLessThan(1);
  });

  test('the font list opens beside the element, never over it (f2ba3495)', async ({ page }) => {
    await openInFillMode(page, PRACTICE_FORM, 'practice-form.pdf');
    const slot = page.locator(`[data-fill-key="${DATE_OF_BIRTH}"]`);
    await slot.scrollIntoViewIfNeeded();
    await slot.focus();
    await page.keyboard.type('29/10/1990');
    await slot.evaluate((node) => node.blur());

    const element = page.locator('[data-editor-element]').filter({ has: page.locator('textarea') });
    await element.locator('textarea').click();
    await element.getByRole('button', { name: 'Aa' }).click();
    const menu = page.locator('[data-font-picker-menu]');
    await expect(menu).toBeVisible();
    const box = await element.boundingBox();
    const overlay = await page.locator('[class*="page-overlay"]').first().boundingBox();
    expect(box.x - overlay.x, 'the element sits in the page\'s left third').toBeLessThan(overlay.width / 3);
    const list = await menu.boundingBox();
    expect(intersects(list, box), `font list ${JSON.stringify(list)} over element ${JSON.stringify(box)}`).toBe(false);
  });

  test('every font puts digits at the same height in a cell (SIGN-38, 0245d8ba)', async ({ page }) => {
    await openInFillMode(page, PRACTICE_FORM, 'practice-form.pdf');
    const slot = page.locator(`[data-fill-key="${DATE_OF_BIRTH}"]`);
    await slot.scrollIntoViewIfNeeded();
    // Focusing a field scrolls the page, so the cell is kept relative to the
    // page overlay and re-read before every measurement.
    const overlay = page.locator('[class*="page-overlay"]').first();
    const slotBox = await slot.boundingBox();
    const origin = await overlay.boundingBox();
    const cellOffset = { dx: slotBox.x - origin.x, dy: slotBox.y - origin.y, width: slotBox.width, height: slotBox.height };
    const cellNow = async () => {
      const o = await overlay.boundingBox();
      return inset({ x: o.x + cellOffset.dx, y: o.y + cellOffset.dy, width: cellOffset.width, height: cellOffset.height }, 3);
    };
    const element = page.locator('[data-editor-element]').filter({ has: page.locator('textarea') });

    // Placement fixes an element's top when it is created, so each face gets a
    // fresh element: pick the face on the last one (the pick is carried to the
    // next field), delete it, and type into the same cell again.
    const centres = {};
    for (const font of ['Arimo', 'Caveat', 'Pacifico']) {
      if (font !== 'Arimo') {
        await element.locator('textarea').click();
        await element.getByRole('button', { name: 'Aa' }).click();
        await page.locator('[data-font-picker-menu]').getByRole('option', { name: font, exact: true }).click();
        await expect(element.getByRole('button', { name: 'Aa' })).toHaveAttribute('title', new RegExp(font));
        await element.getByTitle('Delete element').click();
        await expect(element).toHaveCount(0);
      }
      await slot.focus();
      await page.keyboard.type('0123');
      await slot.evaluate((node) => node.blur());
      const textarea = element.locator('textarea');
      await expect(textarea).toHaveValue('0123');
      const family = await textarea.evaluate((node) => getComputedStyle(node).fontFamily);
      expect(family, `the new element renders in ${font}`).toContain(font);
      await page.evaluate(() => document.fonts.ready);
      const ink = rgbOf(await textarea.evaluate((node) => getComputedStyle(node).color));
      const cell = await cellNow();
      const box = await inkBox(page, cell, ink);
      // Relative to the cell, so a scroll between fonts cannot count as a move.
      centres[font] = (box.top + box.bottom) / 2 - cell.y;
    }
    // The placement puts every face's digit centre at the same spot to within
    // 0.01px, but the browser's own line box does not follow the font tables
    // exactly: measured in Chromium at this size, each face's baseline lands
    // 0.1-0.8px above where the tables put it, and ink resolves to a third of a
    // pixel, so Caveat reads 1.0px below Arimo (WebKit: under 1px). Before
    // SIGN-38 the same cell put Caveat's digits about 2.9px and Pacifico's
    // about 12px below Arimo's, so 1.5px still catches the bug by a wide margin.
    for (const font of ['Caveat', 'Pacifico']) {
      expect(Math.abs(centres[font] - centres.Arimo), `${font}'s digit centre vs Arimo's, ${JSON.stringify(centres)}`).toBeLessThan(1.5);
    }
  });
});

import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { pullCord } from './lamp.js';
import { expectControlsSized } from '../../../../e2e/support/layout.js';
import { tapUntil } from '../../../../e2e/support/touch.js';

/* READ-04: the mark toolbar reuses Sign's .actions class, which is opacity 0 outside an active Sign element.
   Highlight's own rule must win whatever order the stylesheets load in. It shipped invisible once while every
   unit test passed, because jsdom applies no stylesheets. */

test.use({ serviceWorkers: 'block' });

test('clicking a highlight shows its toolbar, visible and on screen, and Escape puts it away', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });

  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();

  const mark = page.locator('[data-page-overlay] [data-element-id]');
  await expect(mark).toHaveCount(1);
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);

  const bar = page.locator('[data-rest-toolbar]');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS('opacity', '1');
  const rect = await bar.boundingBox();
  const view = page.viewportSize();
  expect(rect.x + rect.width).toBeGreaterThan(0);
  expect(rect.y + rect.height).toBeGreaterThan(0);
  expect(rect.x).toBeLessThan(view.width);
  expect(rect.y).toBeLessThan(view.height);

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});

/* READ-11: each thickness in Look draws its line. The line's svg is absolute inside its box, so the box must have a
   size: it shipped as five empty rows under Clean and Sketch (2026-11-02), which no unit test sees. */
test('Look draws a line for every thickness of an underline', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'thickness.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
  const band = await page.locator('[data-page-overlay] [data-element-id]').boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
  await page.locator('[data-look-button]:visible').click();
  await page.locator('[data-editor-popover]').getByRole('radio', { name: 'Underline' }).click();
  await expect(page.locator('[data-editor-thickness] svg')).toHaveCount(5);
  await expectControlsSized(page.locator('[data-editor-popover]'), { selector: '[data-editor-thickness] svg', minWidth: 20, minHeight: 5 });
});

/* R47, R49: on a phone the picked mark's panel is one row from 375 px up, in the normal view and in full screen, and
   with a color behind More (which then wears its ink band), with 44 px tall targets, Comment keeping its word. The page
   never scrolls sideways. A real finger lays and picks the mark (CDP touch), since touch has its own panel host.
   READ-14: Pencil is picked from Look's Clean | Sketch | Pencil toggle, whose three 44 px segments sit on one line inside the popover. */
test.describe('touch panel', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const [w, h, full] of [[402, 874, false], [402, 874, true], [393, 852, false], [375, 812, false]]) {
    test(`${w}x${h}${full ? ' full screen' : ''}: one row, 44 px targets, Comment's word, Pencil from Look`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
      await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
      if (full) {
        await pullCord(page, 'tap');
        await expect(page.locator('[role="toolbar"][data-mode]')).toBeVisible();
        // The page is fitted again for the bigger view: wait until it holds still for a few frames.
        await page.waitForFunction(() => new Promise((done) => {
          const rect = () => JSON.stringify(document.querySelector('[data-page-overlay]')?.getBoundingClientRect());
          const first = rect();
          let frames = 6;
          const tick = () => (frames-- ? requestAnimationFrame(tick) : done(rect() === first));
          requestAnimationFrame(tick);
        }));
      }

      const box = await page.locator('[data-page-overlay]').first().boundingBox();
      const y = box.y + box.height * ((792 - 694) / 792);
      const x0 = box.x + box.width * (72 / 612);
      const x1 = box.x + box.width * (330 / 612);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', x0);
      for (let i = 1; i <= 12; i += 1) await touch('touchMove', x0 + ((x1 - x0) * i) / 12);
      await touch('touchEnd', x1);

      const mark = page.locator('[data-page-overlay] [data-element-id]');
      await expect(mark).toHaveCount(1);
      const band = await mark.boundingBox();
      const row = page.locator('[data-marker-row]:visible');
      // On CI's Linux runner the first tap after Full screen left the panel shut (passes on macOS). A click the browser
      // counts as a second one (detail 2) opens nothing (R7), so the tap is tried again once that window has passed.
      await tapUntil(page, { x: band.x + band.width / 2, y: band.y + band.height / 2 }, async () => (await row.count()) === 1);
      const fits = async (pen) => {
        const rects = await row.locator('button').evaluateAll((els) => els.map((e) => {
          const r = e.getBoundingClientRect();
          return { name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
        }));
        console.log(w, full ? 'full' : 'normal', pen, JSON.stringify(rects.map((r) => `${r.name}:${Math.round(r.w)}x${Math.round(r.h)}@${Math.round(r.y)}`)));
        expect(rects).toHaveLength(7);
        for (const r of rects) {
          expect(r.h, `${r.name} height`).toBeGreaterThanOrEqual(44);
          expect(r.x, `${r.name} left`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${r.name} right`).toBeLessThanOrEqual(w);
        }
        for (const r of rects) expect(Math.abs(r.y - rects[0].y), `${pen}: ${r.name} on the first line`).toBeLessThan(2);
        await expect(row.getByRole('button', { name: 'Comment' })).toHaveText('Comment');
      };
      await fits('yellow');
      // Color cells and More keep the CSS floor (min-width 1.75rem = 28 px) and a 44 px target; a squeezed cell stayed green once.
      const sized = async () => {
        await expectControlsSized(row, { selector: '[data-highlight-swatch], [data-more-colors]', minWidth: 28, minHeight: 44 });
        await expectControlsSized(row, { selector: 'svg', minWidth: 8, minHeight: 8 });
      };
      await sized();
      // A color behind More puts its ink band on the More button, which must still leave the row one line.
      await row.getByRole('button', { name: 'More colors' }).tap();
      await page.locator('[data-more-popover] [data-highlight-swatch]').first().tap();
      await expect(row.locator('[data-more-ink]')).toHaveCount(1);
      await fits('orange');
      await sized();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);

      await row.getByRole('button', { name: 'Look' }).tap();
      const look = page.locator('[role="radiogroup"][aria-label="Stroke"]:visible');
      await expect(look.getByRole('radio')).toHaveCount(3);
      const fit = await look.evaluate((group) => {
        const menu = group.closest('[data-editor-popover]') ?? group.parentElement;
        const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
        return { group: box(group), menu: box(menu), overflow: group.scrollWidth - group.clientWidth, radios: [...group.querySelectorAll('[role="radio"]')].map(box) };
      });
      console.log(w, full ? 'full' : 'normal', 'look toggle', JSON.stringify(fit));
      expect(fit.overflow, 'the toggle does not overflow').toBeLessThanOrEqual(0);
      expect(fit.menu.x).toBeGreaterThanOrEqual(0);
      expect(fit.menu.x + fit.menu.w).toBeLessThanOrEqual(w);
      for (const r of fit.radios) {
        expect(r.h).toBeGreaterThanOrEqual(44);
        expect(Math.abs(r.y - fit.radios[0].y), 'one line').toBeLessThan(1);
        expect(r.x).toBeGreaterThanOrEqual(fit.group.x - 0.5);
        expect(r.x + r.w).toBeLessThanOrEqual(fit.group.x + fit.group.w + 0.5);
      }
      await look.getByRole('radio', { name: 'Pencil' }).tap();
      await expect(look.getByRole('radio', { name: 'Pencil' })).toHaveAttribute('aria-checked', 'true');
      await expect(mark.locator('svg[data-highlight-hatch] path')).toHaveCount(1);
    });
  }
});

/* A trackpad pinch (visual viewport scale above 1) leaves the mark toolbar at its physical size; its popovers must stay
   the size they are at 1x too, not grow with the page. */
test('Look holds its physical size under zoom, like the toolbar', async ({ page, context }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
  const mark = page.locator('[data-page-overlay] [data-element-id]');
  await expect(mark).toHaveCount(1);
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
  const bar = page.locator('[data-rest-toolbar]');
  await expect(bar).toBeVisible();

  const scale = () => page.evaluate(() => window.visualViewport.scale);
  const widths = () => page.evaluate(() => {
    const w = (el) => el.getBoundingClientRect().width * window.visualViewport.scale;
    return { bar: w(document.querySelector('[data-rest-toolbar]')), menu: w(document.querySelector('[data-editor-popover] > *')) };
  });
  await bar.getByRole('button', { name: 'Look' }).click();
  await expect(page.locator('[data-editor-popover]')).toBeVisible();
  const rest = await widths();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--vv-scale')))).toBeCloseTo(2, 1);
  await expect(page.locator('[data-editor-popover]')).toBeVisible();
  await expect.poll(async () => Math.abs((await widths()).menu - rest.menu)).toBeLessThan(2);
  expect(Math.abs((await widths()).bar - rest.bar)).toBeLessThan(2);
});

/* READ-24: only a browser has rects. A rest outlines, a click opens the row at the pointer, its menus clear the mark, and Delete offers Undo where the row stood. */
test.describe('click opens', () => {
  const line = 'A long line of text a student would highlight from one end of the page all the way across to the other';
  async function laidMark(page) {
    const source = await makePdfBuffer(null, { title: false, lines: [{ text: line, y: 700, size: 9 }] });
    await openTool(page, '/highlight-pdf/', { file: { name: 'click.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
    const box = await page.locator('[data-page-overlay]').first().boundingBox();
    const y = box.y + box.height * ((792 - 697) / 792);
    await page.mouse.move(box.x + box.width * (72 / 612), y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (520 / 612), y, { steps: 8 });
    await page.mouse.up();
    const mark = page.locator('[data-page-overlay] [data-element-id]');
    await expect(mark).toHaveCount(1);
    return { mark, band: await mark.boundingBox() };
  }

  test('a rest draws the outline and opens nothing, and leaving the mark takes the outline away', async ({ page }) => {
    const { band } = await laidMark(page);
    await page.mouse.move(band.x + 40, band.y + band.height / 2);
    await page.mouse.move(band.x + 41, band.y + band.height / 2);
    await expect(page.locator('svg[data-mark-outline]')).toHaveCount(1);
    await expect(page.locator('[data-rest-toolbar]')).toHaveCount(0);
    await page.mouse.move(band.x + 40, band.y - 80);
    await expect(page.locator('svg[data-mark-outline]')).toHaveCount(0);
  });

  test('a click at the far end of a long mark opens the row over the pointer, above the line', async ({ page }) => {
    const { band } = await laidMark(page);
    const x = band.x + band.width - 60;
    await page.mouse.click(x, band.y + band.height / 2);
    const bar = page.locator('[data-rest-toolbar]');
    await expect(bar).toBeVisible();
    await expect(page.locator('svg[data-mark-outline]')).toHaveCount(1);
    const rect = await bar.boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(band.y + 1);
    expect(Math.abs(rect.x + rect.width / 2 - x), 'the row centres on the pointer').toBeLessThan(40);
  });

  test('its menus open above the row, off the mark', async ({ page }) => {
    const { band } = await laidMark(page);
    await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
    const bar = page.locator('[data-rest-toolbar]');
    for (const name of ['Look', 'More colors']) {
      await bar.getByRole('button', { name }).click();
      const menu = await page.locator('[data-editor-popover]').boundingBox();
      expect(menu.y + menu.height, `${name} clears the mark`).toBeLessThanOrEqual(band.y);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-editor-popover]')).toHaveCount(0);
      await expect(bar).toBeVisible();
    }
  });

  test('Delete offers Undo where the row stood, and Undo brings the mark back', async ({ page }) => {
    const { mark, band } = await laidMark(page);
    await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
    const bar = page.locator('[data-rest-toolbar]');
    const row = await bar.boundingBox();
    await bar.getByRole('button', { name: 'Delete' }).click();
    await expect(mark).toHaveCount(0);
    const chip = page.locator('[data-undo-chip]');
    await expect(chip).toContainText('Highlight removed');
    const at = await chip.boundingBox();
    expect(Math.abs(at.x + at.width / 2 - (row.x + row.width / 2))).toBeLessThan(2);
    expect(Math.abs(at.y - row.y)).toBeLessThan(2);
    await chip.getByRole('button', { name: 'Undo' }).click();
    await expect(mark).toHaveCount(1);
    await expect(chip).toHaveCount(0);
  });
});

/* READ-24: the row and its menus cover the top of the page on a phone, so the page glides until the mark clears them, and glides back. */
test.describe('touch glide', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a picked mark stays in view under the row and its menu, and the file name is whole', async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 748 }] });
    await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
    const box = await page.locator('[data-page-overlay]').first().boundingBox();
    const y = box.y + box.height * ((792 - 744) / 792);
    const x0 = box.x + box.width * (72 / 612);
    const x1 = box.x + box.width * (330 / 612);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', x0);
    for (let i = 1; i <= 12; i += 1) await touch('touchMove', x0 + ((x1 - x0) * i) / 12);
    await touch('touchEnd', x1);
    const mark = page.locator('[data-page-overlay] [data-element-id]');
    await expect(mark).toHaveCount(1);
    await expect(page.locator('[data-pen-hint]')).toHaveCount(1);
    const band = await mark.boundingBox();
    const row = page.locator('[data-marker-row]:visible');
    await tapUntil(page, { x: band.x + band.width / 2, y: band.y + band.height / 2 }, async () => (await row.count()) === 1);
    await expect(page.locator('[data-pen-hint]')).toHaveCount(0);

    const clearOf = async (selector) => {
      await expect.poll(async () => {
        const [m, cover] = await Promise.all([mark.boundingBox(), page.locator(selector).first().boundingBox()]);
        return m.y - (cover.y + cover.height);
      }).toBeGreaterThanOrEqual(0);
    };
    await clearOf('[data-marker-row]:visible');
    await row.getByRole('button', { name: 'Look' }).tap();
    await clearOf('[data-editor-popover]');

    await page.keyboard.press('Escape');
    await page.mouse.click(4, 860);
    await expect(row).toHaveCount(0);
    await expect.poll(() => page.locator('[data-lamp-part="board"]').evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  });
});

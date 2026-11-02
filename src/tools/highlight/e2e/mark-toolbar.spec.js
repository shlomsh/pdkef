import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

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

/* R47, R49: on a phone the picked mark's panel is one row from 402 px up, in the normal view and in full screen, and
   with a color behind More (which then wears its ink band), with 44 px tall targets and switch halves at least 40 px wide. At 375 px only Comment and Delete may wrap, and the page
   never scrolls sideways. A real finger lays and picks the mark (CDP touch), since touch has its own panel host. */
test.describe('touch panel', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const [w, h, full] of [[402, 874, false], [402, 874, true], [375, 812, false]]) {
    test(`${w}x${h}${full ? ' full screen' : ''}: one row, 44 px targets, 40 px switch halves`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
      await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
      if (full) {
        await page.getByRole('button', { name: 'Full screen' }).first().tap();
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
      await expect.poll(async () => {
        if (await row.count() === 0) await page.touchscreen.tap(band.x + band.width / 2, band.y + band.height / 2);
        return row.count();
      }, { intervals: [600] }).toBe(1);
      const fits = async (pen) => {
        const rects = await row.locator('button').evaluateAll((els) => els.map((e) => {
          const r = e.getBoundingClientRect();
          return { name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
        }));
        console.log(w, full ? 'full' : 'normal', pen, JSON.stringify(rects.map((r) => `${r.name}:${Math.round(r.w)}x${Math.round(r.h)}@${Math.round(r.y)}`)));
        expect(rects).toHaveLength(9);
        for (const r of rects) {
          expect(r.h, `${r.name} height`).toBeGreaterThanOrEqual(44);
          expect(r.x, `${r.name} left`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${r.name} right`).toBeLessThanOrEqual(w);
        }
        for (const name of ['Highlight', 'Underline']) expect(rects.find((r) => r.name === name).w, `${name} width`).toBeGreaterThanOrEqual(40);
        const oneLine = w >= 402 ? rects : rects.filter((r) => r.name !== 'Comment' && r.name !== 'Delete');
        for (const r of oneLine) expect(Math.abs(r.y - rects[0].y), `${pen}: ${r.name} on the first line`).toBeLessThan(2);
      };
      await fits('yellow');
      // A color behind More puts its ink band on the More button, which must still leave the row one line.
      await row.getByRole('button', { name: 'More colors' }).tap();
      await page.locator('[data-more-popover] [data-highlight-swatch]').first().tap();
      await expect(row.locator('[data-more-ink]')).toHaveCount(1);
      await fits('orange');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    });
  }
});

/* A trackpad pinch (visual viewport scale above 1) leaves the mark toolbar at its physical size; its popovers must stay
   the size they are at 1x too, not grow with the page. */
test('the opacity popover holds its physical size under zoom, like the toolbar', async ({ page, context }) => {
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
  await bar.getByRole('button', { name: 'Opacity' }).click();
  await expect(page.locator('[data-editor-popover]')).toBeVisible();
  const rest = await widths();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--vv-scale')))).toBeCloseTo(2, 1);
  await expect(page.locator('[data-editor-popover]')).toBeVisible();
  await expect.poll(async () => Math.abs((await widths()).menu - rest.menu)).toBeLessThan(2);
  expect(Math.abs((await widths()).bar - rest.bar)).toBeLessThan(2);
});

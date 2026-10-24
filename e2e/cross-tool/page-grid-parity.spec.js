import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* GRID epic (docs/shared-page-grid.md): one page grid, identical in every
   tool. Merge and Edit Pages both render the shared PageGrid
   (src/shell/pageGrid/), so this guard defines "identical": the same
   thumbnail boxes, column count, action cluster position and numbers at
   desktop and phone width, and the same drag / keyboard / tap / undo
   behaviour. It loads the same 10-page PDF (page 4 landscape) into each
   route and compares what the grid renders; headings and rails differ by
   design and are not compared. */

const ROUTES = ['/merge/', '/edit-pdf/'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
const THUMBS = 'ul[data-page-grid] > li[data-key] img';

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 10; i += 1) {
    const [w, h] = i === 4 ? [792, 612] : [612, 792];
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.93, 0.95, 1) });
    page.drawText(String(i), { x: w / 2 - 80, y: h / 2 - 100, size: 300, font, color: rgb(0.1, 0.2, 0.5) });
  }
  return Buffer.from(await doc.save());
}

async function openTool(page, route) {
  await page.goto(route);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ten-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(),
  });
  await expect.poll(
    () => page.locator(THUMBS).evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(8);
}

const cells = (page) => page.locator('ul[data-page-grid] > li[data-key]');
const keys = (page) => cells(page).evaluateAll((lis) => lis.map((li) => li.dataset.key));

const boxSizes = (page) => cells(page).evaluateAll((lis) => lis.map((li) => {
  const r = li.querySelector('[data-thumb-box]').getBoundingClientRect();
  return { w: r.width, h: r.height };
}));

const columnCount = (page) => cells(page).evaluateAll((lis) => {
  const tops = lis.map((li) => li.getBoundingClientRect().top);
  const firstRow = lis.filter((_, i) => Math.abs(tops[i] - tops[0]) < 2);
  return new Set(firstRow.map((li) => Math.round(li.getBoundingClientRect().left))).size;
});

/* Reveal page 2's cluster the way the viewport's input does: hover on
   desktop, a tap on phone. Returns each button's offset from the thumb box. */
async function clusterOffsets(page, viewport) {
  const cell = cells(page).nth(1);
  await cell.scrollIntoViewIfNeeded();
  if (viewport.name === 'desktop') await cell.hover();
  else await cell.locator('[data-thumb-box]').tap();
  const buttons = cell.locator('button');
  await expect(buttons).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await expect(buttons.nth(i)).toBeVisible();
  return cell.evaluate((li) => {
    const box = li.querySelector('[data-thumb-box]').getBoundingClientRect();
    return Array.from(li.querySelectorAll('button')).map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top };
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`page grid parity, ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.name === 'phone' });

    async function both(browser, contextOptions, measure) {
      const out = [];
      for (const route of ROUTES) {
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        await openTool(page, route);
        out.push(await measure(page));
        await context.close();
      }
      return out;
    }

    const options = {
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.name === 'phone',
    };

    test('thumbnail boxes and column count match Merge', async ({ browser }) => {
      const [merge, edit] = await both(browser, options, async (page) => ({
        sizes: await boxSizes(page),
        columns: await columnCount(page),
      }));
      expect(merge.sizes).toHaveLength(10);
      expect(edit.sizes).toHaveLength(10);
      edit.sizes.forEach((size, i) => {
        expect(Math.abs(size.w - merge.sizes[i].w), `page ${i + 1} width`).toBeLessThanOrEqual(1);
        expect(Math.abs(size.h - merge.sizes[i].h), `page ${i + 1} height`).toBeLessThanOrEqual(1);
      });
      expect(edit.columns).toBe(merge.columns);
    });

    test('action cluster sits at the same offsets from the thumbnail', async ({ browser }) => {
      const [merge, edit] = await both(browser, options, (page) => clusterOffsets(page, viewport));
      expect(edit).toHaveLength(3);
      edit.forEach((offset, i) => {
        expect(Math.abs(offset.x - merge[i].x), `button ${i} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(offset.y - merge[i].y), `button ${i} y`).toBeLessThanOrEqual(1);
      });
    });

    test('page numbers read the same', async ({ browser }) => {
      const [merge, edit] = await both(browser, options, (page) => page.locator('[data-page-number]').allTextContents());
      expect(merge.length).toBeGreaterThan(0);
      expect(edit).toEqual(merge);
    });
  });
}

for (const route of ROUTES) {
  test.describe(`page grid behaviour, ${route}`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('dragging page 2 onto page 5 reorders it', async ({ page }) => {
      await openTool(page, route);
      const before = await keys(page);
      const from = await cells(page).nth(1).locator('[data-thumb-box]').boundingBox();
      const to = await cells(page).nth(4).locator('[data-thumb-box]').boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
      await page.mouse.up();
      const after = await keys(page);
      expect(after.indexOf(before[1])).not.toBe(1);
      expect([3, 4]).toContain(after.indexOf(before[1]));
    });

    test('keyboard: r rotates, Delete skips, Enter opens the preview', async ({ page }) => {
      await openTool(page, route);
      const first = cells(page).first();
      await first.focus();
      await page.keyboard.press('r');
      await expect(first).toHaveAttribute('data-rotation', '90');
      await page.keyboard.press('Delete');
      await expect(first).toHaveAttribute('data-skipped', /.*/);
      await cells(page).nth(2).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('dialog[open]')).toBeVisible();
    });

    test('undo and redo travel through a rotation', async ({ page }) => {
      await openTool(page, route);
      const first = cells(page).first();
      await first.focus();
      await page.keyboard.press('r');
      await expect(first).toHaveAttribute('data-rotation', '90');
      const undo = page.getByRole('button', { name: 'Undo last change' });
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(first).not.toHaveAttribute('data-rotation', '90');
      await page.getByRole('button', { name: 'Redo last undone change' }).click();
      await expect(first).toHaveAttribute('data-rotation', '90');
    });
  });

  test.describe(`page grid phone tap, ${route}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a tap on a page body does not skip it', async ({ page }) => {
      await openTool(page, route);
      const cell = cells(page).nth(1);
      await cell.scrollIntoViewIfNeeded();
      await cell.locator('[data-thumb-box]').tap();
      await expect(cell).not.toHaveAttribute('data-skipped', /.*/);
    });
  });
}

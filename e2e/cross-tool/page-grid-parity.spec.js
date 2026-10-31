import { test, expect } from '@playwright/test';
import { openTool } from '../support/tool.js';
import { makeNumberedGridPdf } from '../support/pdf.js';

/* GRID epic (docs/shared-page-grid.md): one page grid, identical in every
   tool. Merge, Edit Pages, Split and PDF to Image all render the shared PageGrid
   (src/shell/pageGrid/), so this guard defines "identical": the same
   thumbnail boxes, column count, action cluster position at
   desktop and phone width, and the same tap behaviour. Page numbers, keyboard and undo are
   unit-tested on the shared grid (src/test/cross-tool/shellPageGrid.test.tsx).
   Drag is Merge's and Edit Pages' only; Split and PDF to Image keep source order. It loads the same 10-page PDF (page 4 landscape) into each
   route and compares what the grid renders; headings and rails differ by
   design and are not compared. */

const ROUTES = ['/merge/', '/organize-pdf/', '/split/', '/pdf-to-image/'];
// Split and PDF to Image keep source order (docs/shared-page-grid.md, decision 6): no drag, no move keys.
const REORDERABLE = ['/merge/', '/organize-pdf/'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
const THUMBS = 'ul[data-page-grid] > li[data-key] img';

const makePdf = makeNumberedGridPdf;

async function openGridTool(page, route) {
  await openTool(page, route);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ten-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(),
  });
  await expect.poll(
    () => page.locator(THUMBS).evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(8);
  // The grid stays invisible until its cell size settles (MERGE-24); nothing
  // inside it can take focus or a tap before then.
  await page.locator('ul[data-page-grid][data-fit-settled]').waitFor();
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

    // One measure per route, Merge first: every other tool is compared to it.
    async function each(browser, contextOptions, measure) {
      const out = [];
      for (const route of ROUTES) {
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        await openGridTool(page, route);
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
      const [merge, ...others] = await each(browser, options, async (page) => ({
        sizes: await boxSizes(page),
        columns: await columnCount(page),
      }));
      expect(merge.sizes).toHaveLength(10);
      others.forEach((other, t) => {
        const route = ROUTES[t + 1];
        expect(other.sizes, route).toHaveLength(10);
        other.sizes.forEach((size, i) => {
          expect(Math.abs(size.w - merge.sizes[i].w), `${route} page ${i + 1} width`).toBeLessThanOrEqual(1);
          expect(Math.abs(size.h - merge.sizes[i].h), `${route} page ${i + 1} height`).toBeLessThanOrEqual(1);
        });
        expect(other.columns, route).toBe(merge.columns);
      });
    });

    test('action cluster sits at the same offsets from the thumbnail', async ({ browser }) => {
      const [merge, ...others] = await each(browser, options, (page) => clusterOffsets(page, viewport));
      others.forEach((other, t) => {
        const route = ROUTES[t + 1];
        expect(other, route).toHaveLength(3);
        other.forEach((offset, i) => {
          expect(Math.abs(offset.x - merge[i].x), `${route} button ${i} x`).toBeLessThanOrEqual(1);
          expect(Math.abs(offset.y - merge[i].y), `${route} button ${i} y`).toBeLessThanOrEqual(1);
        });
      });
    });
  });
}

async function dragPage(page, fromIndex, toIndex) {
  const from = await cells(page).nth(fromIndex).locator('[data-thumb-box]').boundingBox();
  const to = await cells(page).nth(toIndex).locator('[data-thumb-box]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

for (const route of ROUTES.filter((r) => !REORDERABLE.includes(r))) {
  test(`${route} keeps source order: a drag and the arrow keys move nothing`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openGridTool(page, route);
    const before = await keys(page);
    await dragPage(page, 1, 4);
    await cells(page).nth(4).focus();
    await page.keyboard.press('ArrowLeft');
    // Time on purpose: a negative check, nothing may move in this window.
    await page.waitForTimeout(300);
    expect(await keys(page)).toEqual(before);
  });
}

for (const route of ROUTES) {
  test.describe(`page grid behaviour, ${route}`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('dragging page 2 onto page 5 reorders it', async ({ page }) => {
      test.skip(!REORDERABLE.includes(route), 'source order only');
      await openGridTool(page, route);
      const before = await keys(page);
      await dragPage(page, 1, 4);
      // The drop commits through the tool's history on the next render. Where it
      // lands depends on how the landscape page 4 (two columns) reflows under the
      // pointer, so the guard asks only that page 2 moved forward.
      await expect.poll(async () => (await keys(page)).indexOf(before[1])).toBeGreaterThan(1);
    });
  });

  test.describe(`page grid phone tap, ${route}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a tap on a page body does not skip it', async ({ page }) => {
      await openGridTool(page, route);
      const cell = cells(page).nth(1);
      await cell.scrollIntoViewIfNeeded();
      await cell.locator('[data-thumb-box]').tap();
      await expect(cell).not.toHaveAttribute('data-skipped', /.*/);
    });
  });
}

/* The loaded card is one screen on desktop: its first-screen floor reaches
   the viewport's foot on a tall window at both a large and a standard size
   (Edit PDF's pages once sat at the 104px minimum in a short card). */
const SCREENS = [
  { width: 1920, height: 1200 },
  { width: 1440, height: 900 },
];
for (const route of ROUTES) {
  for (const { width, height } of SCREENS) {
    test(`the loaded card reaches the foot of a ${width}x${height} screen, ${route}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openGridTool(page, route);
      const floor = await page.evaluate(() => {
        const card = document.querySelector('[data-tool-loaded]');
        return card.getBoundingClientRect().top + parseFloat(getComputedStyle(card).minHeight);
      });
      expect(floor).toBeGreaterThan(height - 32);
      expect(floor).toBeLessThanOrEqual(height);
      expect((await boxSizes(page))[0].w).toBeGreaterThan(104);
    });
  }
}

/* A page's actions stay on the screen at phone width (GRID-06 review): the
   cluster is wider than a 72px cell, and centred on a first- or last-column
   page it ran off the edge (PDF to Image's four controls by 28px at 375px).
   An edge page keeps its cluster inside the grid, mirrored in right-to-left. */
const EDGE_ROUTES = [...ROUTES, '/he/split/', '/he/pdf-to-image/'];
for (const route of EDGE_ROUTES) {
  test(`at 375px every action of an edge page is on screen, ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openGridTool(page, route);
    const columns = await columnCount(page);
    // PDF to Image adds its Save link once the images are built.
    // The sticky bars cover the top of a phone screen: centre a page before clicking it.
    const reveal = async (cell) => {
      await cell.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await cell.locator('[data-thumb-box]').click();
    };
    // The Save link is rendered once the images are built, shown with the rest on reveal.
    if (route.includes('pdf-to-image')) {
      await expect(cells(page).first().locator('a[download]')).toHaveCount(1, { timeout: 15_000 });
    }
    for (const index of [0, columns - 1]) {
      const cell = cells(page).nth(index);
      await reveal(cell);
      const controls = cell.locator('button, a[download]');
      await expect(controls.first()).toBeVisible();
      const rects = await controls.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; }));
      for (const [left, right] of rects) {
        expect(left, `page ${index + 1} control starts on screen`).toBeGreaterThanOrEqual(0);
        expect(right, `page ${index + 1} control ends on screen`).toBeLessThanOrEqual(375);
      }
    }
  });
}

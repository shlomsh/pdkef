import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Direction A (2026-09-13): three guards the critique's writeup called out
   as P0/P1, added alongside the rewritten specs rather than folded into
   them, since each is a standalone invariant of the new document-centre
   layout rather than a re-check of an existing scenario. */

async function makePdfBuffer(label, pageCount = 1) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test('the Download element keeps the same DOM node across preparing and ready (MERGE-16)', async ({ page }, testInfo) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  // Captured as soon as the element exists - DownloadElement.tsx renders one
  // <a data-state> for every state (one-file, preparing, ready, saved,
  // error), never a different component per state, so this handle should
  // stay valid through every transition below.
  const downloadLocator = page.locator('[data-state]');
  await expect(downloadLocator).toBeVisible({ timeout: 10_000 });
  const handle = await downloadLocator.elementHandle();
  if (!handle) throw new Error('Download element has no handle');
  await handle.evaluate((el) => { el.__guard = 1; });

  await expect(downloadLocator).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });

  // Rotate the first page: the plan changes, so the pre-merge re-runs and
  // the element goes preparing -> ready again. The page cell's actions
  // cluster only reveals on hover on a mouse-driven project; the webkit
  // project is a real touch device (iPhone 15), where hover never fires, so
  // it goes through the "Edit pages" toggle instead (PageStrip.module.css /
  // MergeDocument.module.css's touch-only pattern).
  const grid = page.locator('ul[class*="grid"]');
  const firstCard = grid.locator('> li[data-key]').first();
  if (testInfo.project.name === 'webkit') {
    await page.getByRole('button', { name: 'Edit pages', exact: true }).click();
    // The phone's sticky bottom sheet covers the lower third of a 659px
    // iPhone viewport and the sticky app bar the top; a tap under either
    // lands on it. Centre the cell first, as a thumb would by scrolling.
    await firstCard.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
  } else {
    await firstCard.hover();
  }
  // The preparing window for two one-page files is the 600 ms idle wait
  // plus a merge of a few milliseconds, which a polling expect can miss on
  // a fast engine (it did on webkit). A MutationObserver installed before
  // the click records every data-state the node passes through instead.
  await handle.evaluate((el) => {
    el.__states = [el.dataset.state];
    new MutationObserver(() => el.__states.push(el.dataset.state))
      .observe(el, { attributes: true, attributeFilter: ['data-state'] });
  });
  await firstCard.getByRole('button', { name: /^Rotate page/ }).click({ force: true });

  await expect(downloadLocator).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });
  await expect.poll(() => handle.evaluate((el) => el.__states.join('>'))).toMatch(/ready>preparing>ready$/);

  const stillSameNode = await page.evaluate(
    (el) => el.isConnected && el.__guard === 1 && el === document.querySelector('[data-state]'),
    handle,
  );
  expect(stillSameNode).toBe(true);
});

test('a caption is visible, not painted under the thumbnail (critique P0)', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  // Six files of three pages each (18 pages - the design doc's own example
  // figure): enough that the document's height clears one phone screen.
  // A too-small fixture (2 files, 1 page each) hits an unrelated, real
  // overlap on the webkit/mobile project - the rail's sticky bottom sheet
  // sits over part of a document that is shorter than the viewport, which
  // is a separate bug (reported alongside this spec, not asserted here: this
  // guard is about caption-vs-thumbnail paint order specifically).
  const files = await Promise.all(
    ['one.pdf', 'two.pdf', 'three.pdf', 'four.pdf', 'five.pdf', 'six.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name, 3),
    })),
  );
  await page.locator('input[type="file"]').setInputFiles(files);

  const caption = page.locator('li[class*="caption"]').first();
  await expect(caption).toBeVisible();
  const box = await caption.boundingBox();
  if (!box) throw new Error('Caption has no bounding box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const hitsCaption = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest('[class*="caption"]');
  }, point);
  expect(hitsCaption).toBe(true);
});

test('the phone subhead has no clipped last line at 375x812', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const sentences = page.locator('[data-hero-sub] [data-hero-sentence]');
  const total = await sentences.count();
  const visible = [];
  for (let i = 0; i < total; i += 1) {
    if (await sentences.nth(i).isVisible()) visible.push(i);
  }
  // MERGE-06: on a phone, every sentence after the first is hidden outright
  // (never line-clamped, which cut a sentence mid-word) - exactly one
  // sentence remains, and it must be a whole thought, not a fragment.
  expect(visible).toHaveLength(1);
  const text = (await sentences.nth(visible[0]).innerText()).trim();
  expect(text.endsWith('.')).toBe(true);

  const sub = page.locator('[data-hero-sub]');
  const [scrollHeight, clientHeight] = await sub.evaluate((el) => [el.scrollHeight, el.clientHeight]);
  // No overflow clipping: the visible sentence's own box is not cut short by
  // a fixed-height ancestor.
  expect(scrollHeight).toBe(clientHeight);
});

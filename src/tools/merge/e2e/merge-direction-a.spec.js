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
  // it taps the cell instead (there is no Edit pages mode any more -
  // PageStrip.module.css's `[data-selected]` pattern).
  const grid = page.locator('ul[class*="grid"]');
  const firstCard = grid.locator('> li[data-key]').first();
  if (testInfo.project.name === 'webkit') {
    // The phone's sticky bottom sheet covers the lower third of a 659px
    // iPhone viewport and the sticky app bar the top; a tap under either
    // lands on it. Centre the cell first, as a thumb would by scrolling.
    await firstCard.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await firstCard.tap();
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

  // Wave 5 (2026-09-13): a full-width caption row exists only for a run of
  // four pages or more (shorter runs carry a small tag in their first cell),
  // so the fixture is three files of six pages: 18 pages, the design doc's
  // own figure, and the document clears one phone screen, which keeps the
  // rail's sticky bottom sheet off the part being measured.
  const files = await Promise.all(
    ['one.pdf', 'two.pdf', 'three.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name, 6),
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

test('a clicked cell lets go of its action buttons when the pointer moves on', async ({ page }) => {
  // Shlomi (2026-09-13): after a click on Rotate, that cell kept its
  // buttons open (`:focus-within` held by the clicked button) while the
  // pointer hovered another page - two clusters at once. The reveal now
  // follows hover and :focus-visible only; a keyboard-focused cell still
  // shows its cluster.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'six.pdf', mimeType: 'application/pdf', buffer: await makePdfBuffer('six', 6) },
  ]);
  await page.locator('[data-state="one-file"]').waitFor({ timeout: 10_000 });

  const cells = page.locator('ul[class*="grid"] > li[data-key]');
  const cluster = (index) => cells.nth(index).locator('[class*="actions"]');
  await cells.nth(2).hover();
  await cells.nth(2).getByRole('button', { name: /^Rotate page/ }).click();
  await expect(cells.nth(2)).toHaveAttribute('data-rotation', '90');

  await cells.nth(4).hover();
  await expect(cluster(4)).toHaveCSS('visibility', 'visible');
  await expect(cluster(2)).toHaveCSS('visibility', 'hidden');

  // Keyboard focus reveals a cell's cluster. A keyboard event establishes
  // focus-visible modality before targeting the cell directly; WebKit and
  // Chromium otherwise differ after the earlier pointer click.
  await page.keyboard.press('Tab');
  await cells.nth(3).focus();
  await expect(cells.nth(3)).toBeFocused();
  await expect(cluster(3)).toHaveCSS('visibility', 'visible');
});

test('a phone-width window with a mouse: a click on a page reveals its controls', async ({ page }) => {
  // Shlomi (2026-09-13): there is no Edit pages toggle any more. Below
  // 768px the cluster is display:none until `[data-selected]`
  // (PageStrip.module.css), and the selection is set by a plain click
  // handler with no pointer-type gate, so a mouse at phone width (a
  // narrowed window, device mode without touch) reveals a page's controls
  // exactly the same way a tap does. The shared `page` fixture is
  // mouse-only on chromium; webkit's iPhone project is touch and passes by
  // the same click path.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'three.pdf', mimeType: 'application/pdf', buffer: await makePdfBuffer('three', 3) },
  ]);
  await page.locator('[data-state="one-file"]').waitFor({ timeout: 10_000 });

  const first = page.locator('ul[class*="grid"] > li[data-key]').first();
  const rotateButton = first.getByRole('button', { name: /^Rotate page/ });
  await expect(rotateButton).toBeHidden();
  await first.click({ position: { x: 5, y: 5 } });
  await expect(rotateButton).toBeVisible();
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

/* Reported by Shlomi (2026-09-13): at 375px, after a reload, no thumbnails.
   Two causes, both fixed in this build. The browser restores the scroll
   offset the page had before the reload, measured against a layout the
   draft restore then grows by a whole document, so the page opened below
   the grid where nothing was near enough to render; the island sets
   history.scrollRestoration to manual while files are loaded and, because
   WebKit applies that unreliably, resets a restored document once its async
   grid has mounted. And the IntersectionObserver only reports on a rendering
   frame, so a hidden document never rendered a thing; the grid now scans
   the cells near the viewport itself when it mounts and when the document
   becomes visible. This guard covers the first: reload from the bottom of
   the page, and the first page cell in view must render. Runs on the
   webkit (iPhone 15) project too, where the report came from. Restores a
   draft across the reload, so service workers are blocked
   (docs/troubleshooting.md). */
test.describe('thumbnails after a reload', () => {
  test.use({ serviceWorkers: 'block' });

  test('a reload from the bottom of the page opens on the grid and renders the first visible page', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf', 'three.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name, 3),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);
    await expect(page.locator('[data-state="ready"]')).toBeVisible({ timeout: 15_000 });
    // The rail's status line (`.draft-status-row` since the rail reorder; a
    // `.draft-chip` before that).
    await expect(page.locator('[class*="draft-status-row"]').filter({ hasText: 'Draft saved' }).first()).toBeAttached({ timeout: 10_000 });

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await page.reload();
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
    const cells = page.locator('li[class*="page"][data-key]');
    await expect(cells).toHaveCount(9, { timeout: 10_000 });

    // A page cell is within the viewport without any scrolling by the person...
    await expect.poll(() => page.evaluate(() => {
      const cell = [...document.querySelectorAll('li[class*="page"][data-key]')]
        .find((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
      return cell ? cell.getAttribute('data-key') : null;
    }), { timeout: 10_000 }).not.toBeNull();
    // ...and it has its thumbnail.
    await expect.poll(() => page.evaluate(() => {
      const cell = [...document.querySelectorAll('li[class*="page"][data-key]')]
        .find((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
      return !!cell?.querySelector('img[src^="data:"]');
    }), { timeout: 15_000 }).toBe(true);
  });
});

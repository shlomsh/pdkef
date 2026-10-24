import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* Direction A (2026-09-13): the document is the centre. Merge's card
   (`.tool-card`, unchanged) still fills the width before any file is
   loaded, which is what the empty-state boxes below prove; once files land
   the old identity card / sort toolbar / Merge button are gone, replaced by
   the white "document" (the page grid, heading `#page-grid-heading`) and
   a 320px rail. There is no Merge button - the pre-merge runs in the
   background and the Download element (one <a data-state>) reports on the
   result directly, so this spec checks that it arrives ready with an href,
   a download name and "2 pages", never a second, stacked "done" state. */

async function makePdfBuffer(label, pageCount = 1) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test('keeps the Merge card full width and spaces the native-share icon', async ({ page }) => {
  // Native Share is not exposed in every browser context. Supply its supported
  // shape before the island loads so this production-preview guard can verify
  // the post-export control without changing the app's behavior.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });

  await page.goto('/merge');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const app = page.locator('#app');
  const card = page.locator('#app > astro-island > div');
  const dropzone = card.locator('> div').first();
  await expect(card).toBeVisible();
  await expect(dropzone).toBeVisible();

  const [appBox, cardBox, dropzoneBox] = await Promise.all([
    app.boundingBox(),
    card.boundingBox(),
    dropzone.boundingBox(),
  ]);
  if (!appBox || !cardBox || !dropzoneBox) throw new Error('Merge layout boxes are unavailable');

  // E2.5: BasePdfTool's module wrapper must not shrink-wrap its dropzone at
  // desktop widths. The inner dropzone remains inset by the card padding.
  expect(Math.abs(cardBox.x - appBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(cardBox.width - appBox.width)).toBeLessThanOrEqual(1);
  // The unloaded card draws no frame at desktop (HERO-02), so the sheet is
  // the card's full width.
  expect(dropzoneBox.width).toBeLessThanOrEqual(cardBox.width + 1);
  expect(dropzoneBox.width).toBeGreaterThan(cardBox.width - 60);

  const files = await Promise.all(['first.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  // Direction A: there is no Merge button at all, loaded or otherwise - the
  // Download element is the only report on the result.
  await expect(page.getByRole('button', { name: /^Merge/i })).toHaveCount(0);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/);
  await expect(downloadLink).toHaveAttribute('download', 'merged_first.pdf');
  await expect(downloadLink).toContainText('2 pages');

  // Exactly one Download element node, in the "ready" state - never a
  // second, stacked done indicator alongside it.
  await expect(page.locator('[data-state]')).toHaveCount(1);
  await expect(downloadLink).toHaveAttribute('data-state', 'ready');

  // Share sits in the rail's hand-off row alongside Compress / Sign,
  // with the row's own button class (PdfShareButton's `className`), so it is
  // found by name. E2.6's contract holds through that class: a real flex
  // row with a visible, tokenized gap between the icon and the label.
  const shareButton = page.getByRole('button', { name: 'Share', exact: true });
  await expect(shareButton).toBeVisible();
  await expect(shareButton).toHaveCSS('display', 'flex'); // blockified: a flex item of .handoff-row
  await expect(shareButton).toHaveCSS('align-items', 'center');
  await expect(shareButton).toHaveCSS('gap', '4.8px');
});

test('MERGE-11: two taps from an empty page to a saved file, nothing else touched', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['alpha.pdf', 'beta.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  // Tap 1: pick the files (setInputFiles stands in for the OS picker).
  await page.locator('input[type="file"]').setInputFiles(files);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });

  // Tap 2: Download. Nothing else is touched between the two actions.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadLink.click(),
  ]);

  expect(download.suggestedFilename()).toBe('merged_alpha.pdf');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(2);
});

/* MERGE-11 (Shlomi's WYSIWYG rebuild, 2026-09-13): the heading's name is a
   single element at rest and while editing - no button/input swap, no
   border or background appearing on click. jsdom cannot prove a computed
   style matches across a click, or that the heading's own rect holds still
   while the name's text grows, so this is a real-browser guard. */
test('the heading name is WYSIWYG: no chrome at rest, and the heading rect never moves on entering edit', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['Invoice 2024.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const heading = page.locator('#page-grid-heading');
  const name = page.locator('#page-grid-heading span[contenteditable]').first();
  await expect(name).toBeVisible({ timeout: 10_000 });
  await expect(name).toHaveText('merged_Invoice 2024');
  await expect(name).toHaveAttribute('contenteditable', 'false');

  const restStyle = await name.evaluate((el) => {
    const cs = getComputedStyle(el);
    const h2cs = getComputedStyle(el.closest('h2'));
    return {
      fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      h2FontSize: h2cs.fontSize, h2FontWeight: h2cs.fontWeight,
      borderStyle: cs.borderStyle, background: cs.backgroundColor,
    };
  });
  expect(restStyle.fontSize).toBe(restStyle.h2FontSize);
  expect(restStyle.fontWeight).toBe(restStyle.h2FontWeight);
  expect(restStyle.borderStyle).toBe('none');
  expect(restStyle.background).toBe('rgba(0, 0, 0, 0)');

  const before = await heading.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; });

  await name.click();
  await expect(name).toHaveAttribute('contenteditable', /plaintext-only|true/);
  await page.keyboard.type('a much longer name so the box only grows wider');

  const after = await heading.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; });
  // Zero layout shift: x/y/height hold; only the name's own width may change.
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.height).toBe(before.height);

  await page.keyboard.press('Enter');
  await expect(name).toHaveAttribute('contenteditable', 'false');
});

/* Same ticket: a click seeds the caret at the click point rather than
   selecting the whole name or resetting it to the start - typing at a
   mid-name click must land the new text in the middle, not before or after
   the existing text untouched. */
test('a click places the caret where clicked, never select-all, never the start', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  const files = await Promise.all(['Invoice 2024.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const name = page.locator('#page-grid-heading span[contenteditable]').first();
  await expect(name).toHaveText('merged_Invoice 2024', { timeout: 10_000 });

  await name.click();
  await page.keyboard.type('XYZ');
  const midText = await name.textContent();
  // Inserted somewhere inside the original text, not prepended or appended.
  expect(midText).toContain('XYZ');
  expect(midText.startsWith('XYZ')).toBe(false);
  expect(midText.endsWith('XYZ')).toBe(false);
});

/* Team-lead brief, part C: the rail's six blocks (file list, draft status,
   Add files/Clear all, Add page numbers, Download, hand-off row) in order,
   no "Options" or "Saves as" text anywhere, at the 1280x900 the brief names. */
test('rail acceptance at 1280x900: item order, no Options/Saves-as text, 16x16 hand-off icons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  const files = await Promise.all(['Invoice 2024.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.locator('[data-state="ready"]').waitFor({ timeout: 10_000 });

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/\bOptions\b/);
  expect(bodyText).not.toMatch(/Saves as/);

  const rail = page.locator('div[class*="_rail_"]:not([class*="rail-scroll"]):not([class*="rail-pinned"])').first();
  const labels = await rail.evaluate((el) => {
    const out = [];
    const scroll = el.querySelector('[class*="rail-scroll"]');
    const pinned = el.querySelector('[class*="rail-pinned"]');
    if (scroll) for (const c of scroll.children) out.push(c.className);
    if (pinned) for (const c of pinned.children) out.push(c.className);
    return out;
  });
  const kinds = labels.map((label) => {
    if (/file-list/.test(label)) return 'file-list';
    if (/draft-status-row/.test(label)) return 'draft-status';
    if (/quiet-row/.test(label)) return 'quiet-row';
    if (/page-numbers-row/.test(label)) return 'page-numbers';
    if (/handoff-row/.test(label)) return 'handoff-row';
    return 'other';
  }).filter((k) => k !== 'other');
  expect(kinds).toEqual(['file-list', 'draft-status', 'quiet-row', 'page-numbers', 'handoff-row']);

  const handoffSvgSizes = await page.locator('[class*="handoff-row"] svg').evaluateAll((nodes) => nodes.map((n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }));
  expect(handoffSvgSizes.length).toBeGreaterThanOrEqual(2);
  for (const size of handoffSvgSizes) {
    expect(size.w).toBe(16);
    expect(size.h).toBe(16);
  }
});

/* MERGE-24 (2026-10-23, Shlomi): replaces the 2026-09-24 rule "the rail grows
   with its rows, the page scroll reaches the actions, no nested scrollbar".
   A sticky rail taller than the window cut off its top and bottom rows (his
   screenshots), so the rail stays sticky under the app bar, never taller than
   the screen, and only the file list scrolls inside it (two rows at least),
   which keeps Download on screen. */
test('desktop rail stays inside the viewport and only its file list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  // Three pages each, so the card is taller than the window and the rail has
  // something to stick through; with one page each the card ended above 400px
  // of scroll and the rail rightly left with it.
  const files = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const name = `document-${String(index + 1).padStart(2, '0')}.pdf`;
    return { name, mimeType: 'application/pdf', buffer: await makePdfBuffer(name, 3) };
  }));
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.locator('[data-state="ready"]').waitFor({ timeout: 15_000 });

  const rail = page.locator('div[class*="_rail_"]:not([class*="rail-scroll"]):not([class*="rail-pinned"])').first();
  const fileList = rail.locator('ul[class*="file-list"]');
  const addFiles = rail.getByRole('button', { name: 'Add files', exact: true });
  const clearAll = rail.getByRole('button', { name: 'Clear all', exact: true });
  const download = rail.getByRole('link', { name: /Download merged PDF/ });

  const listMetrics = await fileList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(listMetrics.overflowY).toBe('auto');
  expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
  expect(listMetrics.clientHeight).toBeGreaterThanOrEqual(88);

  // Scroll until the card's bottom meets the window's: the rail must still be whole.
  await page.evaluate(() => {
    const card = document.querySelector('[data-tool-loaded]');
    window.scrollTo(0, card.getBoundingClientRect().bottom + window.scrollY - window.innerHeight);
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(addFiles).toBeVisible();
  await expect(clearAll).toBeVisible();
  await expect(download).toBeVisible();
  const railBox = await rail.boundingBox();
  const downloadBox = await download.boundingBox();
  if (!railBox || !downloadBox) throw new Error('Rail or Download has no bounding box');
  expect(railBox.y).toBeGreaterThanOrEqual(56 - 1);
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(700 + 1);
  expect(downloadBox.y).toBeGreaterThanOrEqual(0);
  expect(downloadBox.y + downloadBox.height).toBeLessThanOrEqual(700 + 1);

  const sideways = await rail.evaluate((root) => [root, ...root.querySelectorAll('*')]
    .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
    .filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(sideways).toBe(0);
});

/* Review finding (2026-09-14, tablet): between 768 and 1023px the Download
   element once fell off-screen at the grid's end (rect.top 1392px in an
   1180px viewport). MERGE-24 (2026-10-23) replaced the bottom sheet with a
   completion row in the flow under the pages; the guard now is that it sits
   below the last page and can be scrolled to. The quiet Download in the
   sticky file row is covered in merge-mobile.spec.js. */
test('tablet (820x1180): the completion row sits under the last page and scrolls into view', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  // Two files, nine pages total - a grid tall enough to need scrolling at
  // this viewport, and two entries so the hand-off row renders too.
  const files = await Promise.all([
    ['first.pdf', 8],
    ['second.pdf', 1],
  ].map(async ([name, pageCount]) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name, pageCount),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.locator('li[data-key]')).toHaveCount(9);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await downloadLink.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  const downloadBox = await downloadLink.boundingBox();
  const lastCell = await page.locator('li[data-key]').last().boundingBox();
  if (!downloadBox || !lastCell || !viewport) throw new Error('Download element or viewport unavailable');
  expect(downloadBox.y).toBeGreaterThanOrEqual(lastCell.y + lastCell.height - 1);
  expect(downloadBox.y + downloadBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

/* A Hebrew-first-file merge: the merged_ prefix is deliberately un-translated
   (same as Sign's signed_), so a Hebrew name reads right-to-left with the
   Latin prefix ahead of it, both in the heading and in the download name. */
test('a Hebrew first file keeps the merged_ prefix untranslated, in the heading and the download name', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  const files = await Promise.all(['אישור שנתי.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const name = page.locator('#page-grid-heading span[contenteditable]').first();
  await expect(name).toHaveText('merged_אישור שנתי', { timeout: 10_000 });
  await expect(page.locator('[class*="doc-heading-ext"]').first()).toHaveText('.pdf');

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('download', 'merged_אישור שנתי.pdf', { timeout: 10_000 });
});

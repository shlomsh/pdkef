import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* Direction A (2026-09-13): the document is the centre. Merge's card
   (`.tool-card`, unchanged) still fills the width before any file is
   loaded, which is what the empty-state boxes below prove; once files land
   the old identity card / sort toolbar / Merge button are gone, replaced by
   the white "document" (the page grid, heading `#merge-pages-heading`) and
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
  expect(dropzoneBox.width).toBeLessThan(cardBox.width);
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

  // Share sits in the rail's hand-off row alongside Compress it / Sign it,
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

  const heading = page.locator('#merge-pages-heading');
  const name = page.locator('#merge-pages-heading span[contenteditable]').first();
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

  const name = page.locator('#merge-pages-heading span[contenteditable]').first();
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

  const name = page.locator('#merge-pages-heading span[contenteditable]').first();
  await expect(name).toHaveText('merged_אישור שנתי', { timeout: 10_000 });
  await expect(page.locator('[class*="doc-heading-ext"]').first()).toHaveText('.pdf');

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('download', 'merged_אישור שנתי.pdf', { timeout: 10_000 });
});

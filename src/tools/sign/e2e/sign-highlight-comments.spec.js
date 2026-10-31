import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFHexString, PDFRef } from '@cantoo/pdf-lib';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/**
 * SIGN-44: a comment on a highlight, end to end. jsdom cannot drag a real
 * highlight across rendered text, reload through real IndexedDB, or hand back
 * the real exported file, so this reads the downloaded PDF back with pdf-lib.
 */

// Wide enough for the margin rail of comment cards beside the page.
test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });

const COMMENT = 'הערה לבדיקה';
const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

const toolbar = (page) => page.getByRole('toolbar', { name: 'PDF annotations' });
const overlay = (page) => page.locator('[class*="page-overlay"]').first();
const dot = (page) => page.locator('[data-highlight-dot]');
const header = (page) => page.locator('[data-tool-shell]').getByText('1 comment', { exact: true });

async function openSign(page) {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'highlight-comments.pdf', mimeType: 'application/pdf', buffer: source });
  await expect(overlay(page)).toBeVisible();
  return PDFDocument.load(source).then((doc) => doc.getPageCount());
}

async function highlightTheLine(page) {
  await toolbar(page).getByRole('button', { name: 'Highlight', exact: true }).click();
  const box = await overlay(page).boundingBox();
  // Letter page, baseline y=700 of 792 with an 18pt font: the line centre sits near 693pt.
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
}

const get = (dict, key) => dict.lookup(PDFName.of(key));
const text = (obj) => (obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined);
const name = (obj) => obj?.asString?.();

test('a comment on a highlight survives reload, undo and redo, and exports as standard annotations plus a comments page', async ({ page }) => {
  const sourcePages = await openSign(page);
  await highlightTheLine(page);

  // The highlight's toolbar opens a card in the rail; the card's own Comment button saves it.
  await page.locator('[data-highlight-comment-button]').click();
  const rail = page.locator('[data-comment-rail]').first();
  const note = rail.locator('[data-highlight-note-input]');
  await expect(note).toBeFocused();
  await note.fill(COMMENT);
  await rail.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(rail.getByText(COMMENT, { exact: true })).toBeVisible();
  await expect(dot(page)).toHaveCount(1);
  await expect(header(page)).toBeVisible();

  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // Draft restore: the comment, its dot and the page header's count come back after a real reload.
  await page.reload();
  await waitForIsland(page);
  await expect(dot(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('[data-comment-rail]').getByText(COMMENT, { exact: true })).toBeVisible();
  await expect(header(page)).toBeVisible();

  // One undo step each way for the whole comment.
  await page.keyboard.press(`${MODIFIER}+z`);
  await expect(dot(page)).toHaveCount(0);
  await page.keyboard.press(`${MODIFIER}+Shift+z`);
  await expect(dot(page)).toHaveCount(1);

  const pair = page.locator('[class*="export-actions"]').last();
  const download = pair.getByRole('button', { name: 'Download' });
  await download.scrollIntoViewIfNeeded();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const bytes = await (await import('node:fs/promises')).readFile(await file.path());

  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(sourcePages + 1);
  const first = pdf.getPage(0);
  const annots = (first.node.lookup(PDFName.of('Annots')) ?? PDFArray.withContext(pdf.context)).asArray().map((r) => pdf.context.lookup(r, PDFDict));
  const bySubtype = (s) => annots.filter((a) => name(get(a, 'Subtype')) === `/${s}`);

  const [highlight] = bySubtype('Highlight');
  expect(highlight, 'a /Highlight annotation on page 1').toBeTruthy();
  expect(text(get(highlight, 'Contents'))).toBe(COMMENT);
  expect(bySubtype('Popup').length).toBeGreaterThan(0);
  const freeText = bySubtype('FreeText');
  expect(freeText.length).toBeGreaterThan(0);
  expect(freeText.some((a) => a.has(PDFName.of('IRT')))).toBe(true);

  const links = pdf.getPage(sourcePages).node.lookup(PDFName.of('Annots')).asArray()
    .map((r) => pdf.context.lookup(r, PDFDict)).filter((a) => name(get(a, 'Subtype')) === '/Link');
  expect(links.length).toBeGreaterThan(0);
  const firstPageRef = first.ref;
  for (const link of links) {
    const dest = link.lookup(PDFName.of('Dest')) ?? get(link.lookup(PDFName.of('A')), 'D');
    const target = dest.asArray()[0];
    expect(target instanceof PDFRef && target.toString() === firstPageRef.toString()).toBe(true);
  }
});

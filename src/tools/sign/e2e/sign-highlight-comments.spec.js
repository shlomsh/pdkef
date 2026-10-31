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
const header = (page, n = 1) => page.getByText(n === 1 ? '1 comment' : `${n} comments`, { exact: true });
const cards = (page) => page.locator('[data-comment-card]');

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

async function swipeTheLine(page, tool) {
  await toolbar(page).getByRole('button', { name: tool, exact: true }).click();
  const box = await overlay(page).boundingBox();
  // Letter page, baseline y=700 of 792 with an 18pt font: the line centre sits near 693pt.
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
}

// Click the rendered highlight itself; it is the only element under that point.
async function selectTheHighlight(page) {
  await page.locator('[data-editor-element]').first().click();
  await expect(page.locator('[data-element-comment-button]')).toBeVisible();
}

const highlightTheLine = (page) => swipeTheLine(page, 'Highlight');

async function saveCard(page, value) {
  const rail = page.locator('[data-comment-rail]').first();
  const note = rail.locator('[data-highlight-note-input]');
  await expect(note).toBeFocused();
  await note.fill(value);
  await rail.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(rail.getByText(value, { exact: true })).toBeVisible();
}

async function exportBytes(page) {
  const pair = page.locator('[class*="export-actions"]').last();
  const download = pair.getByRole('button', { name: 'Download' });
  await download.scrollIntoViewIfNeeded();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  return (await import('node:fs/promises')).readFile(await file.path());
}

async function firstPageAnnots(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const first = pdf.getPage(0);
  const annots = (first.node.lookup(PDFName.of('Annots')) ?? PDFArray.withContext(pdf.context)).asArray().map((r) => pdf.context.lookup(r, PDFDict));
  return { pdf, first, annots, bySubtype: (s) => annots.filter((a) => name(get(a, 'Subtype')) === `/${s}`) };
}
const printed = (a) => ((a.lookup(PDFName.of('F'))?.asNumber?.() ?? 0) & 4) !== 0;

const get = (dict, key) => dict.lookup(PDFName.of(key));
const text = (obj) => (obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined);
const name = (obj) => obj?.asString?.();

test('a comment on a highlight survives reload, undo and redo, goes with its highlight, and exports', async ({ page }) => {
  const sourcePages = await openSign(page);
  await highlightTheLine(page);

  // Select the highlight if the swipe did not leave it selected, then comment on it.
  const commentButton = page.locator('[data-element-comment-button]');
  if (!(await commentButton.isVisible())) await selectTheHighlight(page);
  await commentButton.click();
  await saveCard(page, COMMENT);
  await expect(cards(page)).toHaveCount(1);
  await expect(header(page)).toBeVisible();

  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // Draft restore: the comment and the page header's count come back after a real reload.
  await page.reload();
  await waitForIsland(page);
  await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('[data-comment-rail]').getByText(COMMENT, { exact: true })).toBeVisible();
  await expect(header(page)).toBeVisible();

  // One undo step each way for the whole comment.
  await page.keyboard.press(`${MODIFIER}+z`);
  await expect(cards(page)).toHaveCount(0);
  await expect(header(page)).toHaveCount(0);
  await page.keyboard.press(`${MODIFIER}+Shift+z`);
  await expect(cards(page)).toHaveCount(1);
  await expect(header(page)).toBeVisible();

  // Deleting the highlight takes its comment with it, and one undo brings both back.
  await selectTheHighlight(page);
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
  await expect(header(page)).toHaveCount(0);
  await page.keyboard.press(`${MODIFIER}+z`);
  await expect(cards(page)).toHaveCount(1);
  await expect(header(page)).toBeVisible();

  const bytes = await exportBytes(page);
  const { pdf, first, bySubtype } = await firstPageAnnots(bytes);
  expect(pdf.getPageCount()).toBe(sourcePages + 1);

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

test('the Comment tool comments on a passage or pins a note, neither printed', async ({ page }) => {
  await openSign(page);

  await swipeTheLine(page, 'Comment');
  await saveCard(page, 'passage note');

  // As in Google Docs, a passage comment is its tint alone; a tap on it selects it, with no bubble, frame or empty bar.
  const passage = page.locator('[data-editor-element]:has([data-comment-root])').first();
  await page.keyboard.press('Escape');
  await passage.click();
  await expect(passage).toHaveAttribute('data-editor-active', 'true');
  await expect(page.locator('[data-comment-marker]')).toHaveCount(0);
  await expect(passage).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await expect(passage.locator('[data-editor-actions]')).toBeHidden();

  await toolbar(page).getByRole('button', { name: 'Comment', exact: true }).click();
  const box = await overlay(page).boundingBox();
  // Blank page well below the text, still inside the 900px viewport (60% down would be off-screen).
  await page.mouse.click(box.x + box.width * 0.5, box.y + 300);
  await saveCard(page, 'pin note');

  await expect(page.locator('[data-comment-pin]')).toHaveCount(1);
  await expect(header(page, 2)).toBeVisible();

  const bytes = await exportBytes(page);
  const { bySubtype } = await firstPageAnnots(bytes);
  const highlights = bySubtype('Highlight');
  expect(highlights).toHaveLength(1);
  expect(text(get(highlights[0], 'Contents'))).toBe('passage note');
  expect(printed(highlights[0])).toBe(false);
  const notes = bySubtype('Text');
  expect(notes).toHaveLength(1);
  expect(text(get(notes[0], 'Contents'))).toBe('pin note');
  expect(name(get(notes[0], 'Name'))).toBe('/Comment');
  expect(printed(notes[0])).toBe(false);
});

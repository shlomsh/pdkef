import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName, PDFDict } from '@cantoo/pdf-lib';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { buildHighlightedPdf } from '../../../test/support/highlightedPdf.js';

/**
 * SIGN-44 round-trip contract (docs/sign-comments-model.md): export a document with comments, open the
 * exported file in PDkef again, and it looks the same. Every highlight and comment comes back as an
 * editable element, nothing is baked into the page image, and the export adds no badge and no page.
 * jsdom has no canvas pixels, no real download and no second file load, so this runs in the browser.
 */
test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });

const toolbar = (page) => page.getByRole('toolbar', { name: 'PDF annotations' });
const overlay = (page) => page.locator('[class*="page-overlay"]').first();

async function openSign(page, name, buffer) {
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(overlay(page)).toBeVisible();
}

/** The y of a text line whose baseline sits at `baseline` points on a Letter page, in CSS px. */
async function lineY(page, baseline) {
  const box = await overlay(page).boundingBox();
  return { box, y: box.y + box.height * ((792 - baseline + 6) / 792) };
}

async function swipe(page, tool, baseline) {
  await toolbar(page).getByRole('button', { name: tool, exact: true }).click();
  const { box, y } = await lineY(page, baseline);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (300 / 612), y, { steps: 8 });
  await page.mouse.up();
}

async function save(page, value) {
  const rail = page.locator('[data-comment-rail]').first();
  const note = rail.locator('[data-highlight-note-input]');
  await expect(note).toBeFocused();
  await note.fill(value);
  await rail.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(rail.getByText(value, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}

/** What the page shows, independent of ids: each mark's kind and box, and the comment texts. */
async function snapshot(page) {
  return page.evaluate(() => {
    const pct = (el, key) => Math.round(parseFloat(el.style[key]) * 2) / 2;
    const marks = [...document.querySelectorAll('[data-editor-element]')].map((el) => ({
      kind: el.hasAttribute('data-editor-highlight') ? 'highlight'
        : el.querySelector('[data-comment-pin]') ? 'pin'
          : el.querySelector('[data-comment-overlay]') ? 'element-comment'
            : el.querySelector('[data-comment-root]') ? 'passage' : 'other',
      left: pct(el, 'left'), top: pct(el, 'top'), width: pct(el, 'width'), height: pct(el, 'height'),
    })).sort((a, b) => a.kind.localeCompare(b.kind) || a.top - b.top);
    const texts = [...document.querySelectorAll('[data-comment-card]')].map((c) => c.innerText.trim()).sort();
    return { marks, texts };
  });
}

/** Pixels in the page image that are not grey: the source is black text on white, so any is a baked mark. */
async function colouredCanvasPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[class*="page-overlay"]').parentElement.querySelector('canvas');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 40) count += 1;
    }
    return count;
  });
}

test('a document with comments exports to standard annotations and opens back looking the same', async ({ page, browser }) => {
  // Sign no longer makes highlights (READ-04): this one is a standard /Highlight in the file, as another viewer writes it.
  const source = await buildHighlightedPdf({
    lines: [{ text: 'The first line someone highlights', y: 700 }, { text: 'The second line someone comments on', y: 640 }],
    highlights: [{ line: 'The first line someone highlights' }],
  });
  await openSign(page, 'roundtrip.pdf', source);
  await expect.poll(() => colouredCanvasPixels(page)).toBe(0);

  await page.locator('[data-editor-highlight]').first().click();
  await page.locator('[data-element-comment-button]').click();
  await save(page, 'on the highlight');

  await swipe(page, 'Comment', 640);
  await save(page, 'on the passage');

  await toolbar(page).getByRole('button', { name: 'Comment', exact: true }).click();
  const box = await overlay(page).boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + 300);
  await save(page, 'a pin');

  const before = await snapshot(page);
  expect(before.marks.map((m) => m.kind).sort()).toEqual(['element-comment', 'highlight', 'passage', 'pin']);

  const download = page.locator('[class*="export-actions"]').last().getByRole('button', { name: 'Download' });
  await download.scrollIntoViewIfNeeded();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const exported = await fs.readFile(await file.path());

  // Standard annotations only: no badge, no comments page.
  const pdf = await PDFDocument.load(exported);
  expect(pdf.getPageCount()).toBe((await PDFDocument.load(source)).getPageCount());
  const subtypes = (pdf.getPage(0).node.lookup(PDFName.of('Annots'))?.asArray() ?? [])
    .map((ref) => pdf.context.lookup(ref, PDFDict).get(PDFName.of('Subtype'))?.toString()).sort();
  expect(subtypes).toEqual(['/Highlight', '/Highlight', '/Popup', '/Popup', '/Text']);

  // A fresh session opens the exported file: the same marks and comments, nothing baked into the page.
  const reopened = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })).newPage();
  await openSign(reopened, 'roundtrip-exported.pdf', exported);
  await expect(reopened.locator('[data-comment-card]')).toHaveCount(3);
  expect(await snapshot(reopened)).toEqual(before);
  await expect.poll(() => colouredCanvasPixels(reopened)).toBe(0);
});

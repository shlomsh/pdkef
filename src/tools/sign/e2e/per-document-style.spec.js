import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * SIGN-33 and SIGN-35 (backlog/tasks/SIGN-33.md, SIGN-35.md), as product-path
 * specs. SIGN-33 guards per-document style: every setting a person chooses in a
 * document is its own, and going back to a document, through recents or after a
 * reload, brings its own settings back. SIGN-35 is the refinement on top: the
 * same explicit choice ALSO becomes the app-wide default for a new document's
 * unset keys (colour, alignment, bold, italic, date format, symbol mark and
 * size, line thickness, whiteout colour, signature width, and a font only when
 * picked from the font menu), resolved document -> app-wide -> shipped default.
 * Only the direction never goes app-wide; it stays document-only.
 *
 * jsdom cannot prove any of this - it needs rendered CSS (color, text-align,
 * font-weight, font-size), a real double-click-free UI flow through the actual
 * toolbar controls, and a real `page.reload()` plus real IndexedDB/localStorage
 * round-trips across several documents.
 */

test.use({ serviceWorkers: 'block' });

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

const RED = '#d8342b';
const CREAM = '#f5f0dc';
const DEFAULT_BLUE = '#1463ff';

function pad2(n) { return String(n).padStart(2, '0'); }

/** Mirrors src/editor/text/dateFormat.ts's formatDate for 'dmy'/'mdy', from
 * today's date on this machine - the same machine the browser under test runs
 * on, so the two clocks agree. */
function expectedDmy(date = new Date()) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}
function expectedMdy(date = new Date()) {
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
}

/** A plainly different Latin-text PDF, generated in place rather than borrowing
 * an existing fixture: it is built at document A's own page size (595x842 - see
 * the node check this spec's author ran) so a text element's rendered
 * font-size in px is directly comparable across documents, which no two binary
 * fixtures in this repo happen to share. `title` both labels the page and
 * gives each generated document distinct bytes, so recents keeps them apart. */
async function makeDocumentBuffer(title) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 72, y: 760, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`A plain Latin document, unrelated to the practice form (${title}).`, {
    x: 72, y: 736, size: 11, font, color: rgb(0.3, 0.3, 0.3),
  });
  return Buffer.from(await doc.save());
}

function toolbar(page) {
  return page.getByRole('toolbar', { name: 'PDF annotations' });
}
function toolButton(page, name) {
  return toolbar(page).getByRole('button', { name, exact: true });
}
async function armTool(page, name) {
  const btn = toolButton(page, name);
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
}

async function openFreshSignTool(page, buffer, fileName) {
  // Once per test, not on every navigation: the reload and the trip home
  // below must keep the recents pointer this browser wrote.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sign33-cleared')) return;
    localStorage.clear();
    sessionStorage.setItem('sign33-cleared', '1');
  });
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

async function replaceWithFile(page, buffer, fileName) {
  await page.getByRole('button', { name: 'Replace file', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a different file?' });
  await expect(dialog).toBeVisible();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

async function openRecent(page, fileName) {
  await page.goto('/?next=0');
  const tile = page.getByRole('button', { name: new RegExp(`Open recent PDF, ${fileName.replace('.', '\\.')}`) });
  await expect(tile).toHaveCount(1);
  await tile.click();
  await page.waitForURL('**/sign/**', { timeout: 15_000 });
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible({ timeout: 10_000 });
}



async function clickOverlayAt(page, xRatio, yRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
}

async function dragOverlay(page, startRatio, endRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 5 });
  await page.mouse.up();
}

function activeElement(page) {
  return page.locator('[data-editor-element][data-editor-active]');
}

/** Text tool, placed on the first detected typable field on the page (the
 * only placement in this spec that must land on a real field, per Shlomi's
 * example - everywhere else a free placement is enough to prove the carried
 * style, since TextNode applies `textAlign` from the same carried value
 * regardless of whether the box sits on a field). */
async function addTextOnFirstField(page) {
  await armTool(page, 'Text');
  const field = page.locator('[class*="field-hint-cell"]').first();
  await expect(field).toBeVisible({ timeout: 10_000 });
  // The hint span itself is a non-interactive visual overlay (it never
  // receives pointer events); the real click target is the page overlay
  // underneath it, at the hint's own rendered position - the same pattern
  // form-grid-fill.spec.js's tapFirstCheckbox uses.
  const fieldBox = await field.boundingBox();
  const overlay = page.locator('[class*="page-overlay"]').first();
  const overlayBox = await overlay.boundingBox();
  await overlay.click({
    position: {
      x: fieldBox.x + fieldBox.width / 2 - overlayBox.x,
      y: fieldBox.y + fieldBox.height / 2 - overlayBox.y,
    },
  });
  const element = activeElement(page);
  const input = element.locator('[data-editor-text-input]');
  await expect(input).toBeVisible();
  return { element, input };
}

async function addTextAt(page, xRatio, yRatio) {
  await armTool(page, 'Text');
  await clickOverlayAt(page, xRatio, yRatio);
  const element = activeElement(page);
  const input = element.locator('[data-editor-text-input]');
  await expect(input).toBeVisible();
  return { element, input };
}

async function addDateAt(page, xRatio, yRatio) {
  await armTool(page, 'Date');
  await clickOverlayAt(page, xRatio, yRatio);
  const element = activeElement(page);
  await expect(element).toBeVisible();
  return element;
}

async function addSymbolAt(page, xRatio, yRatio) {
  await armTool(page, 'Symbols');
  await clickOverlayAt(page, xRatio, yRatio);
  const element = activeElement(page);
  await expect(element).toBeVisible();
  return element;
}

async function addWhiteoutAt(page, startRatio, endRatio) {
  await armTool(page, 'Whiteout');
  await dragOverlay(page, startRatio, endRatio);
  // A new whiteout's own toolbar is what identifies it (its colour control).
  const element = page.locator('[data-editor-element]').filter({ has: page.getByTitle('Whiteout color', { exact: true }) }).last();
  await expect(element).toBeVisible();
  return element;
}

function whiteoutFill(element) {
  return element.locator('> div:not([data-editor-actions])');
}

/** The date field's own format-cycling control (ElementToolbar.tsx): its
 * title always reads "Date format: {current text}. Click to change." */
function dateFormatButton(element) {
  return element.locator('[title^="Date format:"]');
}
async function currentDateText(element) {
  const title = await dateFormatButton(element).getAttribute('title');
  return title.replace(/^Date format: /, '').replace(/\. Click to change\.$/, '');
}
async function cycleDateFormat(element, times) {
  for (let i = 0; i < times; i += 1) await dateFormatButton(element).click();
}

async function setTextColor(element, hex) {
  await element.locator('button[title="Text color"]').click();
  await element.page().locator(`[data-editor-color-menu] [data-editor-color-swatch][title="${hex}"]`).click();
}
async function setWhiteoutColorPreset(element, hex) {
  await element.locator('button[title="Whiteout color"]').click();
  await element.page().locator(`[data-editor-color-menu] [data-editor-color-swatch][title="${hex}"]`).click();
}
/** No cream preset exists in ColorPicker.tsx's PRESET_COLORS (only black, red,
 * blue, green, navy and white) - this reaches through the same popover's native
 * `<input type=color>`, the other half of "the palette" widget, rather than
 * inventing a selector for a swatch that is not there. */
async function setWhiteoutColorCustom(element, hex) {
  await element.locator('button[title="Whiteout color"]').click();
  const input = element.page().locator('[data-editor-color-menu] input[type="color"]');
  await input.fill(hex);
}

async function fontSizePx(input) {
  return parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize));
}
function alignButton(element) {
  // Matches whichever of the three cycling titles is current (see
  // ElementToolbar.tsx's alignLeftTitle/alignCenterTitle/alignRightTitle).
  return element.locator('button[title^="Text sits at"], button[title^="Text is centred"]');
}
async function cycleAlign(element, times) {
  for (let i = 0; i < times; i += 1) await alignButton(element).click();
}

test('every setting a person chooses is remembered per document, and going back to a document brings its own back', async ({ page }) => {
  const dmy = expectedDmy();
  const mdy = expectedMdy();

  // --- Step 1: document A, in Hebrew, with a whole set of explicit choices ---
  // Its own bytes (a trailing PDF comment), so it is its own recents entry and
  // not merged with the bundled practice form by content hash.
  const bufferA = Buffer.concat([fs.readFileSync(PRACTICE_FORM), Buffer.from('\n% SIGN-33 document A\n')]);
  await openFreshSignTool(page, bufferA, 'sign-doc-a.pdf');

  const textA = await addTextOnFirstField(page);
  await textA.input.fill('שלום עולם');
  await expect(textA.input).toHaveAttribute('dir', 'rtl');

  await cycleAlign(textA.element, 3); // left -> center -> right, from the auto 'right' start
  await expect(textA.input).toHaveCSS('text-align', 'right');

  await textA.element.getByTitle('Bold', { exact: true }).click();
  await expect(textA.input).toHaveCSS('font-weight', '700');

  await setTextColor(textA.element, RED);
  await expect(textA.input).toHaveCSS('color', 'rgb(216, 52, 43)');

  const sizeA0 = await fontSizePx(textA.input);
  await textA.element.getByTitle('Increase font size', { exact: true }).click();
  await textA.element.getByTitle('Increase font size', { exact: true }).click();
  const sizeAAfter = await fontSizePx(textA.input);
  expect(sizeAAfter, 'A+ twice must make the text visibly larger').toBeGreaterThan(sizeA0);

  const dateA = await addDateAt(page, 0.78, 0.12);
  await cycleDateFormat(dateA, 2); // locale -> iso -> dmy
  expect(await currentDateText(dateA)).toBe(dmy);

  const symbolA = await addSymbolAt(page, 0.78, 0.2);
  await expect(symbolA.getByTitle('Check mark', { exact: true })).toHaveClass(/active/);
  await symbolA.getByTitle('X mark', { exact: true }).click();
  await expect(symbolA.getByTitle('X mark', { exact: true })).toHaveClass(/active/);


  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // --- Step 2: document B, through Replace, starting from A's app-wide style ---
  const bufferB = await makeDocumentBuffer('Employment Form');
  await replaceWithFile(page, bufferB, 'sign-doc-b.pdf');

  const textB = await addTextAt(page, 0.3, 0.3);
  // A's explicit choices (colour, alignment, bold, date format, size) are
  // also the app-wide default, so B's first element starts from them - but
  // not A's direction, which stays document-only (SIGN-35 reopened). Both
  // documents share a page size (see makeDocumentBuffer's comment), so the
  // size is directly comparable: it follows the latest choice, not the
  // document.
  await expect(textB.input).toHaveAttribute('dir', 'ltr');
  await expect(textB.input).toHaveCSS('text-align', 'right');
  await expect(textB.input).toHaveCSS('font-weight', '700');
  await expect(textB.input).toHaveCSS('color', 'rgb(216, 52, 43)'); // A's red, carried app-wide
  const sizeB0 = await fontSizePx(textB.input);
  expect(sizeB0, "B's first element must start at A's app-wide size").toBeCloseTo(sizeAAfter, 0);

  await textB.input.fill('Employment form filled');

  // B now makes its own explicit choices. Each one is B's own document style
  // and, from here on, the new app-wide default.
  await setTextColor(textB.element, DEFAULT_BLUE);
  await expect(textB.input).toHaveCSS('color', 'rgb(20, 99, 255)');

  await cycleAlign(textB.element, 1); // right -> left
  await expect(textB.input).toHaveCSS('text-align', 'left');

  await textB.element.getByTitle('Bold', { exact: true }).click(); // un-bold
  await expect(textB.input).not.toHaveCSS('font-weight', '700');

  await textB.element.getByTitle('Increase font size', { exact: true }).click();
  await textB.element.getByTitle('Increase font size', { exact: true }).click();
  await textB.element.getByTitle('Increase font size', { exact: true }).click();
  const sizeBAfter = await fontSizePx(textB.input);
  expect(sizeBAfter).toBeGreaterThan(sizeB0);

  const dateB = await addDateAt(page, 0.3, 0.42);
  expect(await currentDateText(dateB)).toBe(dmy); // A's date format, carried app-wide
  await cycleDateFormat(dateB, 2); // dmy -> dmyDigits -> mdy
  expect(await currentDateText(dateB)).toBe(mdy);


  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // --- Step 3: a real reload, back to A, then back to B ---
  await page.reload();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await openRecent(page, 'sign-doc-a.pdf');

  // Whatever A had stays A's: a fresh element, placed off any existing box,
  // must start in A's own carried choices, which win over the app-wide style
  // (now B's, from step 2) for every key A itself set.
  const textA2 = await addTextAt(page, 0.78, 0.42);
  await expect(textA2.input).toHaveAttribute('dir', 'rtl');
  await expect(textA2.input).toHaveCSS('text-align', 'right');
  await expect(textA2.input).toHaveCSS('font-weight', '700');
  await expect(textA2.input).toHaveCSS('color', 'rgb(216, 52, 43)');
  const sizeA2 = await fontSizePx(textA2.input);
  expect(sizeA2).toBeCloseTo(sizeAAfter, 0);

  const dateA2 = await addDateAt(page, 0.78, 0.5);
  expect(await currentDateText(dateA2)).toBe(dmy);

  const symbolA2 = await addSymbolAt(page, 0.78, 0.58);
  await expect(symbolA2.getByTitle('X mark', { exact: true })).toHaveClass(/active/);


  await openRecent(page, 'sign-doc-b.pdf');

  const textB2 = await addTextAt(page, 0.6, 0.3);
  await expect(textB2.input).toHaveAttribute('dir', 'ltr');
  // B chose left, so its own choice wins over the app-wide alignment.
  await expect(textB2.input).toHaveCSS('text-align', 'left');
  await expect(textB2.input).not.toHaveCSS('font-weight', '700');
  await expect(textB2.input).toHaveCSS('color', 'rgb(20, 99, 255)');
  const sizeB2 = await fontSizePx(textB2.input);
  expect(sizeB2, "B's new element must carry B's own larger size, not A's and not the default").toBeCloseTo(sizeBAfter, 0);
  expect(sizeB2).not.toBeCloseTo(sizeAAfter, 0);

  const dateB2 = await addDateAt(page, 0.6, 0.42);
  expect(await currentDateText(dateB2)).toBe(mdy);

});

test('an app-wide default follows the latest choice, but a document that already chose keeps its own', async ({ page }) => {
  const bufferA = Buffer.concat([fs.readFileSync(PRACTICE_FORM), Buffer.from('\n% SIGN-35 document A\n')]);
  const bufferC = await makeDocumentBuffer('Consent Form');
  const bufferB = await makeDocumentBuffer('Employment Form');
  const bufferD = await makeDocumentBuffer('Delivery Note');

  // --- a: document A chooses black ---
  await openFreshSignTool(page, bufferA, 'style-doc-a.pdf');
  const textA = await addTextAt(page, 0.2, 0.2);
  await textA.input.fill('A');
  await setTextColor(textA.element, '#000000');
  await expect(textA.input).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // --- b: document C, a new text starts from A's app-wide black; C chooses nothing ---
  await replaceWithFile(page, bufferC, 'style-doc-c.pdf');
  const textC = await addTextAt(page, 0.3, 0.3);
  await expect(textC.input).toHaveCSS('color', 'rgb(0, 0, 0)');
  await textC.input.fill('C');
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // --- c: document B, a new text still starts black, then B chooses blue ---
  await replaceWithFile(page, bufferB, 'style-doc-b.pdf');
  const textB = await addTextAt(page, 0.4, 0.4);
  await expect(textB.input).toHaveCSS('color', 'rgb(0, 0, 0)');
  await setTextColor(textB.element, DEFAULT_BLUE);
  await expect(textB.input).toHaveCSS('color', 'rgb(20, 99, 255)');
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // --- d: document D, a new text now starts from B's later blue ---
  await replaceWithFile(page, bufferD, 'style-doc-d.pdf');
  const textD = await addTextAt(page, 0.5, 0.5);
  await expect(textD.input).toHaveCSS('color', 'rgb(20, 99, 255)');

  // --- e: back to C - it never chose, so it now follows the latest choice too ---
  await openRecent(page, 'style-doc-c.pdf');
  const textC2 = await addTextAt(page, 0.65, 0.25);
  await expect(textC2.input).toHaveCSS('color', 'rgb(20, 99, 255)');

  // --- f: a real reload, back to A - its own choice is untouched by B's later one ---
  await page.reload();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await openRecent(page, 'style-doc-a.pdf');
  const textA2 = await addTextAt(page, 0.78, 0.58);
  await expect(textA2.input).toHaveCSS('color', 'rgb(0, 0, 0)');
});

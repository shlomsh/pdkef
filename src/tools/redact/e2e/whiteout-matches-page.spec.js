import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFDict, PDFStream } from '@cantoo/pdf-lib';

// RED-51: a new Whiteout patch takes the colour of the page around it (the
// median of a ring just outside it), follows the page when moved, can be set
// by eyedropper or back to Auto, and exports in that same colour with no
// stroke. Each of these is rendered-pixel behaviour jsdom cannot see.

const CREAM = [247, 241, 222];
const BLUE = [222, 235, 247];

// One page, a full cream sheet, a pale blue band across its lower middle and
// three lines of text on the cream (PDF points, bottom-left origin).
async function makeMatchPdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(247 / 255, 241 / 255, 222 / 255) });
  page.drawRectangle({ x: 0, y: 150, width: 612, height: 220, color: rgb(222 / 255, 235 / 255, 247 / 255) });
  for (const [i, y] of [660, 626, 592].entries()) {
    page.drawText(`Cream page, line ${i + 1}: the quick brown fox jumps`, {
      x: 56,
      y,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

// Same raw-JPEG read as redact-editor.spec.js: DCTDecode streams already ARE
// the JPEG bytes.
function extractFlattenedJpegBytes(pdfPage) {
  const context = pdfPage.doc.context;
  const resources = pdfPage.node.Resources();
  if (!resources) throw new Error('Saved page has no Resources dict');
  const xObjects = context.lookup(resources.get(PDFName.of('XObject')));
  if (!(xObjects instanceof PDFDict)) throw new Error('Saved page has no XObject dictionary');
  for (const name of xObjects.keys()) {
    const xObject = context.lookup(xObjects.get(name));
    if (!(xObject instanceof PDFStream)) continue;
    const subtype = xObject.dict.lookup(PDFName.of('Subtype'));
    const filter = xObject.dict.lookup(PDFName.of('Filter'));
    if (
      subtype instanceof PDFName && subtype.asString() === '/Image' &&
      filter instanceof PDFName && filter.asString() === '/DCTDecode'
    ) {
      return xObject.getContents();
    }
  }
  throw new Error('Saved page has no DCTDecode image XObject');
}

async function collectCspViolations(page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.effectiveDirective}: ${e.blockedURI || e.sourceFile}`);
    });
  });
}

async function assertNoCspViolations(page) {
  const violations = await page.evaluate(() => window.__cspViolations || []);
  expect(violations, `Unexpected CSP violations:\n${violations.join('\n')}`).toEqual([]);
}

async function openRedactTool(page, buffer) {
  const browserMessages = [];
  page.on('console', (message) => {
    browserMessages.push(`[${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    browserMessages.push(`[pageerror] ${error.message}`);
  });

  await collectCspViolations(page);
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/redact');

  // Wait for hydration before touching the file input (see redact-editor.spec.js).
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'whiteout-match-e2e.pdf',
    mimeType: 'application/pdf',
    buffer,
  });

  try {
    await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  } catch (error) {
    throw new Error(
      `Redact workspace did not appear after selecting a PDF.\nBrowser messages:\n${browserMessages.join('\n') || '(none)'}\n\n${error.message}`,
    );
  }
  await expect(page.locator('.redact-draw-area').first()).toBeVisible();
  // The patch samples the page canvas, so wait until pdf.js has painted it.
  await expect.poll(() => canvasPixel(page, 0.5, 0.01)).not.toEqual([0, 0, 0]);
}

async function selectRedactStyle(page, name) {
  const tool = page
    .getByRole('toolbar', { name: 'PDF redaction' })
    .getByRole('button', { name, exact: true });
  if ((await tool.getAttribute('aria-pressed')) !== 'true') {
    await tool.click();
  }
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(50);
}

async function drawRedaction(page, styleName, startRatio, endRatio) {
  await selectRedactStyle(page, styleName);
  const beforeCount = await page.locator('[class*="redact-box"]').count();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  // The page is taller than the viewport: centre the requested Y first.
  await overlay.evaluate((element, yRatio) => {
    const rect = element.getBoundingClientRect();
    window.scrollBy(0, rect.top + rect.height * yRatio - window.innerHeight / 2);
  }, startRatio.y);
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');

  const startPoint = { x: box.x + box.width * startRatio.x, y: box.y + box.height * startRatio.y };
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await expect(page.locator('.redact-drawing-preview')).toHaveCount(1);
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 6 });
  await expect(page.locator('.redact-drawing-preview')).toBeVisible();
  await page.waitForTimeout(50);
  await page.mouse.up();

  await expect(page.locator('[class*="redact-box"]')).toHaveCount(beforeCount + 1);
  const redaction = page.locator('[class*="redact-box"]').nth(beforeCount);
  await expect(redaction).toBeVisible();
  return redaction;
}

async function getBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box;
}

async function selectRedaction(redaction) {
  const box = await getBox(redaction, 'Selectable redaction');
  await redaction.click({ position: { x: box.width / 2, y: box.height / 2 } });
}

// A pixel of the live pdf.js canvas at a ratio of the page.
async function canvasPixel(page, xRatio, yRatio) {
  return page.locator('[data-editor-page-card] canvas').first().evaluate((canvas, p) => {
    const x = Math.min(canvas.width - 1, Math.max(0, Math.round(p.x * canvas.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.round(p.y * canvas.height)));
    const [r, g, b] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    return [r, g, b];
  }, { x: xRatio, y: yRatio });
}

// A pixel of the live canvas at a viewport (client) point.
async function canvasPixelAtClient(page, clientX, clientY) {
  return page.locator('[data-editor-page-card] canvas').first().evaluate((canvas, p) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(canvas.width - 1, Math.max(0, Math.round(((p.x - rect.left) * canvas.width) / rect.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.round(((p.y - rect.top) * canvas.height) / rect.height)));
    const [r, g, b] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    return [r, g, b];
  }, { x: clientX, y: clientY });
}

// The pixel 6 CSS px left of a box, at its mid-height.
async function pixelBesideBox(page, redaction) {
  const rect = await getBox(redaction, 'Whiteout box');
  return canvasPixelAtClient(page, rect.x - 6, rect.y + rect.height / 2);
}

async function surfaceFill(redaction) {
  const css = await redaction.locator('.redact-surface').evaluate((el) => getComputedStyle(el).backgroundColor);
  return css.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function expectClose(actual, expected, tolerance, label) {
  actual.forEach((channel, i) => {
    expect(Math.abs(channel - expected[i]), `${label}: channel ${i} was ${channel}, expected ${expected[i]} +-${tolerance}`).toBeLessThanOrEqual(tolerance);
  });
}

async function expectFillCloseTo(redaction, expected, tolerance, label) {
  await expect.poll(async () => {
    const fill = await surfaceFill(redaction);
    return Math.max(...fill.map((channel, i) => Math.abs(channel - expected[i])));
  }, { message: label }).toBeLessThanOrEqual(tolerance);
}

// Offset of the box's top from its page overlay's top, so it survives scrolling.
async function topWithinPage(page, redaction) {
  const overlayBox = await getBox(page.locator('.redact-draw-area').first(), 'PDF overlay');
  const boxBox = await getBox(redaction, 'Whiteout box');
  return boxBox.y - overlayBox.y;
}

const BOX_START = { x: 0.07, y: 0.183 };
const BOX_END = { x: 0.56, y: 0.228 };

test.describe('Whiteout matches the page (RED-51)', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  test('matches the page and follows it', async ({ page }) => {
    await openRedactTool(page, await makeMatchPdfBuffer());
    const whiteout = await drawRedaction(page, 'Whiteout', BOX_START, BOX_END);
    await page.keyboard.press('Escape');
    await expect(whiteout.locator('[data-editor-actions]')).toHaveCount(0);

    // On the cream: the fill is the page pixel just left of the box, and the
    // host carries no border or outline at rest.
    const besideCream = await pixelBesideBox(page, whiteout);
    expectClose(besideCream, CREAM, 2, 'page pixel beside the box on cream');
    await expectFillCloseTo(whiteout, besideCream, 2, 'fill matches the cream page pixel');
    await expect(whiteout).toHaveCSS('border-top-width', '0px');
    await expect(whiteout).toHaveCSS('outline-style', 'none');
    const fillOnCream = await surfaceFill(whiteout);
    const topBefore = await topWithinPage(page, whiteout);

    // Drag it down so its centre lands at ratio y 0.6, onto the blue band. The
    // gesture starts near the left edge, clear of any floating controls, with
    // the box parked just below the sticky toolbar: a press under that
    // toolbar lands on the toolbar, not the box.
    const overlay = page.locator('.redact-draw-area').first();
    const toolbarBox = await getBox(page.getByRole('toolbar', { name: 'PDF redaction' }), 'Redact toolbar');
    await whiteout.evaluate((element, below) => {
      window.scrollBy(0, element.getBoundingClientRect().top - below);
    }, toolbarBox.y + toolbarBox.height + 40);
    const overlayBox = await getBox(overlay, 'PDF overlay');
    const boxBefore = await getBox(whiteout, 'Whiteout box before drag');
    const grabX = boxBefore.x + 12;
    const grabY = boxBefore.y + boxBefore.height / 2;
    const dy = overlayBox.y + overlayBox.height * 0.6 - (boxBefore.y + boxBefore.height / 2);
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX, grabY + dy / 2, { steps: 5 });
    await page.mouse.move(grabX, grabY + dy, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Escape');

    const besideBlue = await pixelBesideBox(page, whiteout);
    expectClose(besideBlue, BLUE, 2, 'page pixel beside the moved box');
    await expectFillCloseTo(whiteout, besideBlue, 2, 'fill re-sampled to the blue band');
    const fillOnBlue = await surfaceFill(whiteout);
    expect(
      Math.max(...fillOnBlue.map((channel, i) => Math.abs(channel - CREAM[i]))),
      `moved fill ${fillOnBlue} should differ from cream`,
    ).toBeGreaterThan(10);

    // The move and its re-sample are one undo step.
    await page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => Math.abs((await topWithinPage(page, whiteout)) - topBefore)).toBeLessThanOrEqual(2);
    await expectFillCloseTo(whiteout, fillOnCream, 2, 'Undo brings the cream fill back');
  });

  test('eyedropper and Auto', async ({ page }) => {
    await openRedactTool(page, await makeMatchPdfBuffer());
    const whiteout = await drawRedaction(page, 'Whiteout', BOX_START, BOX_END);
    await selectRedaction(whiteout);

    const bar = whiteout.locator('[data-editor-actions]');
    const auto = bar.locator('[data-redact-color-auto]');
    const eyedropper = bar.locator('[data-redact-color-eyedropper]');
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await eyedropper.click();
    await expect(eyedropper).toHaveAttribute('aria-pressed', 'true');

    // Bring the blue band (ratio y 0.65, away from the box) into view and press it.
    const overlay = page.locator('.redact-draw-area').first();
    await overlay.evaluate((element, args) => {
      const rect = element.getBoundingClientRect();
      const from = rect.top + rect.height * args.fromY;
      const to = rect.top + rect.height * 0.65;
      window.scrollBy(0, (from + to) / 2 - window.innerHeight / 2);
    }, { fromY: (BOX_START.y + BOX_END.y) / 2 });
    const overlayBox = await getBox(overlay, 'PDF overlay');
    await page.mouse.click(overlayBox.x + overlayBox.width * 0.8, overlayBox.y + overlayBox.height * 0.65);

    await expect(bar).toBeVisible();
    await expectFillCloseTo(whiteout, BLUE, 2, 'eyedropper sets the blue');
    await expect(auto).toHaveAttribute('aria-pressed', 'false');
    // RED-53: the picked colour is now the first recent swatch, shown as chosen.
    await expect(bar.locator('[data-redact-color-recent][aria-pressed="true"]')).toBeVisible();

    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await expectFillCloseTo(whiteout, CREAM, 2, 'Auto samples the cream page again');
  });

  test('exports the patch in the matched colour with no stroke', async ({ page }) => {
    await openRedactTool(page, await makeMatchPdfBuffer());
    const whiteout = await drawRedaction(page, 'Whiteout', BOX_START, BOX_END);
    await page.keyboard.press('Escape');

    // The box as ratios of the page, measured from the live DOM.
    const overlayBox = await getBox(page.locator('.redact-draw-area').first(), 'PDF overlay');
    const boxBox = await getBox(whiteout, 'Whiteout box');
    const left = (boxBox.x - overlayBox.x) / overlayBox.width;
    const top = (boxBox.y - overlayBox.y) / overlayBox.height;
    const width = boxBox.width / overlayBox.width;
    const height = boxBox.height / overlayBox.height;
    const insetX = 2 / overlayBox.width;
    const insetY = 2 / overlayBox.height;

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    const savedPath = await download.path();
    if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
    const saved = await PDFDocument.load(fs.readFileSync(savedPath));
    const jpegBase64 = Buffer.from(extractFlattenedJpegBytes(saved.getPage(0))).toString('base64');

    const [centre, insideLeft, insideTop, reference] = await page.evaluate(async ({ base64, points }) => {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Flattened JPEG failed to decode'));
        img.src = `data:image/jpeg;base64,${base64}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return points.map(({ x, y }) => {
        const [r, g, b] = ctx.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data;
        return [r, g, b];
      });
    }, {
      base64: jpegBase64,
      points: [
        { x: left + width / 2, y: top + height / 2 },
        { x: left + insetX, y: top + height / 2 },
        { x: left + width / 2, y: top + insetY },
        // The page 2% of its width outside the box's left edge.
        { x: left - 0.02, y: top + height / 2 },
      ],
    });

    expectClose(reference, CREAM, 8, 'exported page pixel outside the box');
    expectClose(centre, reference, 6, 'patch centre vs page');
    expectClose(insideLeft, reference, 6, 'patch 2px inside its left edge vs page (no stroke)');
    expectClose(insideTop, reference, 6, 'patch 2px inside its top edge vs page (no stroke)');
  });

  test('Peek outlines a deselected patch', async ({ page }) => {
    await openRedactTool(page, await makeMatchPdfBuffer());
    const whiteout = await drawRedaction(page, 'Whiteout', BOX_START, BOX_END);
    await page.keyboard.press('Escape');
    await expect(whiteout.locator('[data-editor-actions]')).toHaveCount(0);
    await expect(whiteout).toHaveCSS('outline-style', 'none');

    const peek = page.locator('[data-redact-peek]');
    await peek.scrollIntoViewIfNeeded();
    const peekBox = await getBox(peek, 'Peek button');
    await page.mouse.move(peekBox.x + peekBox.width / 2, peekBox.y + peekBox.height / 2);
    await page.mouse.down();
    await expect(whiteout).toHaveCSS('outline-style', 'dashed');
    await page.mouse.up();
    await expect(whiteout).toHaveCSS('outline-style', 'none');
  });
});

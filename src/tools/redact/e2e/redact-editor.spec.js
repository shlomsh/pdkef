import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFDict, PDFStream } from '@cantoo/pdf-lib';
import { getPageContentBytes } from '../../../editor/adapters/pdf/pdfObjects.js';

// Reads a saved page's own content stream the same way deleteObjects.js does,
// decoding the hex-string text operands @cantoo/pdf-lib writes (`<4B45...> Tj`)
// back to plain text. This is deliberately not pdf.js text extraction: RED-13's
// download path rewrites the content stream directly (deleteObjects.js), so
// checking that stream is closer to the actual guarantee than re-parsing
// through a whole second renderer.
function decodedPageText(pdfPage) {
  const raw = Buffer.from(getPageContentBytes(pdfPage)).toString('latin1');
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
    .join(' ');
}

// A covered page's saved picture is a single JPEG XObject drawn full-page
// (flattenPage in redact.js). DCTDecode is a filter @cantoo/pdf-lib's own
// decodePDFRawStream() does not decode (it throws UnsupportedEncodingError),
// which is fine here: for that filter the raw stream contents already ARE
// the JPEG bytes, so this reads them directly off the XObject dict instead.
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

async function makeMultiPagePdfBuffer(pageCount) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Redact tool e2e fixture, page ${i + 1}`, {
      x: 72,
      y: 720,
      size: 18,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Redact tool e2e fixture', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('Hide this account number: 1234-5678-9012', {
    x: 72,
    y: 690,
    size: 12,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  page.drawText('Keep redaction boxes page-bound near every edge.', {
    x: 72,
    y: 660,
    size: 12,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  return Buffer.from(await doc.save());
}

// Collects the browser's own securitypolicyviolation events (structured,
// spec-defined, cross-engine) rather than scraping console text — see E1.7
// in TODO.md. Installed via addInitScript so it's listening before any
// script on the page runs, including the astro-island hydration bootstrap.
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

async function openRedactTool(page, buffer = null) {
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

  // Wait for the client:load island to finish hydrating before touching the file
  // input. The <input type=file> opens the OS picker even unhydrated, but its
  // Preact onChange only attaches after hydration — an early setFiles is silently
  // dropped and the workspace never renders (the intermittent 10s timeout).
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'redact-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: buffer || await makePdfBuffer(),
  });

  try {
    // .first(): a multi-page fixture (RED-03) renders one page-wrapper per
    // page, and this only needs to know at least one painted.
    await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  } catch (error) {
    throw new Error(
      `Redact workspace did not appear after selecting a PDF.\nBrowser messages:\n${browserMessages.join('\n') || '(none)'}\n\n${error.message}`,
    );
  }
  await expect(page.locator('.redact-draw-area').first()).toBeVisible();
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
  // The PDF page is taller than the viewport. scrollIntoViewIfNeeded() only
  // exposes part of an oversized element, so explicitly center the requested
  // fractional Y position before using viewport-relative mouse coordinates.
  await overlay.evaluate((element, yRatio) => {
    const rect = element.getBoundingClientRect();
    window.scrollBy(0, rect.top + rect.height * yRatio - window.innerHeight / 2);
  }, startRatio.y);
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');

  const startPoint = { x: box.x + box.width * startRatio.x, y: box.y + box.height * startRatio.y };
  const hitTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName,
      className: element?.className,
      insideOverlay: !!element?.closest('.redact-draw-area'),
    };
  }, startPoint);
  expect(hitTarget.insideOverlay, `Drag start missed overlay: ${JSON.stringify(hitTarget)}`).toBe(true);
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

async function expectWithinPage(redaction, overlay) {
  const elementBox = await getBox(redaction, 'Redaction box');
  const overlayBox = await getBox(overlay, 'PDF overlay');
  expect(elementBox.x).toBeGreaterThanOrEqual(overlayBox.x - 1);
  expect(elementBox.y).toBeGreaterThanOrEqual(overlayBox.y - 1);
  expect(elementBox.x + elementBox.width).toBeLessThanOrEqual(overlayBox.x + overlayBox.width + 1);
  expect(elementBox.y + elementBox.height).toBeLessThanOrEqual(overlayBox.y + overlayBox.height + 1);
  expect(elementBox.width).toBeGreaterThan(8);
  expect(elementBox.height).toBeGreaterThan(8);
}

async function dragBy(page, locator, dx, dy) {
  const box = await getBox(locator, 'Draggable redaction');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.mouse.up();
}

test.describe('Redact editor browser guardrails', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  // Design review, from a real ID scan with three redaction boxes on one
  // page: whiteout showed the shared floating toolbar on selection, but
  // blackout and blur instead drew their own inline red round delete button
  // inside the box - different icon, different colour, a position that
  // itself moved (top/right 8px with resize handles shown, -10px without).
  // All three types now share exactly one selection chrome: the same
  // floating toolbar (RedactBoxToolbar via RedactBox's `[data-editor-actions]`
  // wrapper), positioned the same way, showing nothing until the box is
  // selected and nothing on hover alone.
  test('keeps one shared selection chrome across whiteout, blackout and blur, resizable and page-bound, in the real browser', async ({ page }) => {
    await openRedactTool(page);

    const overlay = page.locator('.redact-draw-area').first();

    // Keep all three boxes in the viewport-reachable upper band (a full PDF page
    // renders taller than the viewport, so drags below ~0.5 land off-screen) and
    // non-overlapping — leaving room below blackout for it to grow on resize.
    const whiteout = await drawRedaction(page, 'Whiteout', { x: 0.18, y: 0.16 }, { x: 0.38, y: 0.22 });
    const blackout = await drawRedaction(page, 'Blackout', { x: 0.18, y: 0.28 }, { x: 0.38, y: 0.34 });
    const blur = await drawRedaction(page, 'Blur', { x: 0.2, y: 0.42 }, { x: 0.36, y: 0.48 });

    // Nothing shows before selection, for any of the three types - and
    // hovering (blackout/blur's old cue) is not enough on its own either.
    for (const [name, redaction] of [['whiteout', whiteout], ['blackout', blackout], ['blur', blur]]) {
      await expect(redaction.locator('[data-editor-actions]'), `${name} should show no toolbar before selection`).toHaveCount(0);
    }
    await blackout.hover();
    await expect(blackout.locator('[data-editor-actions]'), 'hover alone must not reveal the toolbar').toHaveCount(0);

    // Each type shows the identical floating toolbar, at the identical offset
    // above the box, once selected - measured so a future regression can't
    // silently reintroduce a per-type divergence.
    const offsetAboveBoxTop = {};

    await selectRedaction(whiteout);
    await expect(whiteout.locator('[data-editor-resizer]')).toHaveCount(8);
    {
      const toolbar = whiteout.locator('[data-editor-actions]');
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
      // Whiteout is the only type with a per-element colour control - its
      // toolbar carries two extra buttons (Auto, eyedropper) plus a custom
      // colour input over blackout's two (duplicate, delete): four buttons
      // and one input[type="color"] on this single-page fixture.
      await expect(toolbar.locator('button')).toHaveCount(4);
      await expect(toolbar.locator('input[type="color"]')).toHaveCount(1);
      const boxRect = await getBox(whiteout, 'whiteout box');
      const toolbarRect = await getBox(toolbar, 'whiteout toolbar');
      offsetAboveBoxTop.whiteout = boxRect.y - (toolbarRect.y + toolbarRect.height);
    }
    // Fill lives on the inset registry-rendered surface, not the host box
    // (E7.4 - renderRedactionSurface is the sole fill/blur/border owner).
    await expect(whiteout.locator('.redact-surface')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await selectRedaction(blackout);
    await expect(blackout.locator('[data-editor-resizer]')).toHaveCount(8);
    {
      const toolbar = blackout.locator('[data-editor-actions]');
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
      await expect(toolbar.locator('button'), 'blackout has no colour control - only duplicate and delete').toHaveCount(2);
      const boxRect = await getBox(blackout, 'blackout box');
      const toolbarRect = await getBox(toolbar, 'blackout toolbar');
      offsetAboveBoxTop.blackout = boxRect.y - (toolbarRect.y + toolbarRect.height);
    }

    const beforeResize = await getBox(blackout, 'Blackout before resize');
    const bottomRight = blackout.locator('[data-editor-resizer="bottom-right"]');
    await bottomRight.hover();
    const handleBox = await getBox(bottomRight, 'Blackout bottom-right handle');
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2 + 55);
    await page.mouse.up();
    const afterResize = await getBox(blackout, 'Blackout after resize');
    expect(afterResize.width).toBeGreaterThan(beforeResize.width + 40);
    expect(afterResize.height).toBeGreaterThan(beforeResize.height + 20);
    await expectWithinPage(blackout, overlay);

    await selectRedaction(blur);
    await expect(blur.locator('[data-editor-resizer]')).toHaveCount(8);
    {
      const toolbar = blur.locator('[data-editor-actions]');
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
      // Blur has no colour, but it has a strength slider (RED-30), then duplicate and delete.
      await expect(toolbar.locator('input[type="range"]'), 'blur carries its strength slider').toHaveCount(1);
      await expect(toolbar.locator('button'), 'blur carries duplicate and delete').toHaveCount(2);
      // RED-53: one row, the slider on the buttons' centre line (it once sat
      // about 9px low under a heading).
      const centres = await toolbar.locator('button, input[type="range"]').evaluateAll((els) =>
        els.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }));
      expect(Math.max(...centres) - Math.min(...centres), 'blur toolbar controls share one centre line').toBeLessThan(1);
      const boxRect = await getBox(blur, 'blur box');
      const toolbarRect = await getBox(toolbar, 'blur toolbar');
      offsetAboveBoxTop.blur = boxRect.y - (toolbarRect.y + toolbarRect.height);

      // The strength a person picks scales the blur with the box's own
      // rendered height (container query units), not a fixed pixel radius -
      // proof this is real in a browser, not just what the style says.
      const blurLayer = blur.locator('.redact-surface__blur');
      const readBlurPx = async () => {
        const filter = await blurLayer.evaluate((el) => getComputedStyle(el).backdropFilter);
        const match = filter.match(/blur\(([\d.]+)px\)/);
        expect(match, `expected a blur() filter, got "${filter}"`).not.toBeNull();
        return Number(match[1]);
      };
      // cqh resolves against the container's content box, inside its 1px border.
      const surfaceHeight = await blur.locator('.redact-surface').evaluate((el) => el.clientHeight);

      // 0.3 is DEFAULT_BLUR_STRENGTH (RED-24).
      expect(await readBlurPx()).toBeCloseTo(0.3 * surfaceHeight, 0);
      await toolbar.locator('[data-editor-blur-strength-input]').evaluate((input) => {
        input.value = '0.4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(await readBlurPx()).toBeCloseTo(0.4 * surfaceHeight, 0);
    }

    await dragBy(page, blur, 2000, -2000);
    await expectWithinPage(blur, overlay);

    // eslint-disable-next-line no-console -- deliberate: the offsets are part of this guardrail's evidence.
    console.log('Redact selection-toolbar offset above box top (px):', offsetAboveBoxTop);
    expect(offsetAboveBoxTop.blackout).toBeCloseTo(offsetAboveBoxTop.whiteout, 0);
    expect(offsetAboveBoxTop.blur).toBeCloseTo(offsetAboveBoxTop.whiteout, 0);
    // RED-53: a clear gap, so the box's top-centre handle can be grabbed under the pill.
    expect(offsetAboveBoxTop.whiteout, 'pill sits clear of the box top').toBeGreaterThanOrEqual(12);
  });

  // Start over is gone: it and Replace both meant "I want a different file", so
  // the toolbar carries one control that says it once. What this guards is
  // unchanged - a confirmation raised from inside real full screen has to paint
  // in the top layer, and the first Escape must close it without also dropping
  // out of full screen.
  test('keeps the replace confirmation visible in real full screen', async ({ page }) => {
    await openRedactTool(page);
    await drawRedaction(page, 'Blackout', { x: 0.18, y: 0.28 }, { x: 0.38, y: 0.34 });

    // The desktop toolbar (this test's 1600px viewport) shows ViewControl's
    // segmented radiogroup instead of a plain FullscreenButton - see
    // src/editor-ui/ViewControl.tsx.
    await page.getByRole('radio', { name: 'Full screen' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-busy') === 'false')).toBe(true);

    await page.getByRole('button', { name: 'Replace file', exact: true }).click();

    const confirmation = page.getByRole('dialog', { name: 'Open a different file?' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('stays in your recent files');

    // The first Escape closes the top-layer dialog; it must not also exit full screen.
    await page.keyboard.press('Escape');
    await expect(confirmation).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-busy') === 'false')).toBe(true);

    await page.evaluate(() => document.exitFullscreen());
  });

  // Redact's touch-action is now conditional (E9: nothing is armed when a file
  // loads, so a phone can scroll the page until a drawing tool is armed - see
  // the touchAction comment on the page wrapper in PdfRedactTool.jsx). jsdom
  // can assert the inline style value itself (PdfRedactTool.test.jsx does),
  // but not whether a real browser actually honors it, so the one fact worth
  // pinning here is that native scrolling really is prevented once a drawing
  // tool is armed - mirrors the equivalent Sign guardrail in sign-editor.spec.js.
  test('prevents native scrolling during a drag-drawn creation gesture', async ({ page }) => {
    await openRedactTool(page);
    await selectRedactStyle(page, 'Whiteout');

    const prevented = await page.locator('.redact-draw-area').first().evaluate((overlay) => {
      const rect = overlay.getBoundingClientRect();
      const touchAt = (x, y) => new Touch({ identifier: 1, target: overlay, clientX: x, clientY: y });
      const start = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touchAt(rect.left + 30, rect.top + 30)],
      });
      overlay.dispatchEvent(start);

      const move = new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [touchAt(rect.left + 90, rect.top + 90)],
      });
      window.dispatchEvent(move);
      window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
      return move.defaultPrevented;
    });

    expect(prevented).toBe(true);
  });
});

// Design-review findings #1 and #2: jsdom has no layout, so the CSS-only
// touch-target floors added for this review (`.delete-candidate::before`,
// `.resizer::before`, `.element-button::before`)
// need a real browser to prove. Coordinates are read as computed style,
// matching toolbar-touch-targets.spec.js's own approach of measuring
// rendered geometry rather than clicking blind. Blackout/blur used to carry
// their own `.redact-element-btn::before` floor for their now-removed inline
// delete button; they measure through `.element-button::before` below like
// every other shared-toolbar control, since the toolbar-parity fix moved
// them onto it.
test.describe('per-element touch targets (design-review findings #1 and #2)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  async function makeTinyTextPdfBuffer() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // A 4pt run renders only a few CSS px tall once pdf.js paints it to the
    // page canvas at this fixture's scale - finding #1's exact complaint.
    page.drawText('tiny', { x: 20, y: 150, size: 4, font, color: rgb(0.1, 0.1, 0.1) });
    return Buffer.from(await doc.save());
  }

  // Computed `inset` on `::before` (the technique `.resizer` and
  // `.element-button` use, the latter now covering every redaction type's
  // toolbar buttons - blackout/blur included) expanded against the real
  // element's own rendered rect - CSS `inset` shorthand resolves like
  // `margin`'s 1/2/3/4-value forms, so this covers every one it can compute
  // to.
  async function insetHitSize(locator) {
    return locator.evaluate((el) => {
      const own = el.getBoundingClientRect();
      const parts = getComputedStyle(el, '::before').inset.split(' ').map((v) => parseFloat(v) || 0);
      const [top, right, bottom, left] = parts.length === 1
        ? [parts[0], parts[0], parts[0], parts[0]]
        : parts.length === 2
          ? [parts[0], parts[1], parts[0], parts[1]]
          : parts.length === 3
            ? [parts[0], parts[1], parts[2], parts[1]]
            : parts;
      return { width: own.width + Math.abs(left) + Math.abs(right), height: own.height + Math.abs(top) + Math.abs(bottom) };
    });
  }

  // The centred `min-width`/`min-height` technique `.delete-candidate` uses
  // instead: unlike the resizer/toolbar controls, this
  // one has to reach its floor even when the real element is *smaller* than
  // the floor in both dimensions, not just widen a fixed visual by a fixed
  // amount.
  async function centeredMinHitSize(locator) {
    return locator.evaluate((el) => {
      const own = el.getBoundingClientRect();
      const cs = getComputedStyle(el, '::before');
      return {
        width: Math.max(own.width, parseFloat(cs.minWidth) || 0),
        height: Math.max(own.height, parseFloat(cs.minHeight) || 0),
      };
    });
  }

  test('finding #1: gives a tiny Delete-tool candidate a real 24px minimum hit box', async ({ page }) => {
    await openRedactTool(page, await makeTinyTextPdfBuffer());
    await selectRedactStyle(page, 'Delete');

    const candidate = page.locator('[class*="delete-candidate"]').first();
    await expect(candidate).toBeVisible();

    const before = await getBox(candidate, 'Delete candidate');
    // Confirms the fixture actually reproduces the reviewed problem - a
    // vacuous pass here would mean this guardrail proves nothing.
    expect(before.height, 'fixture text run should render under the 24px floor').toBeLessThan(24);

    const after = await centeredMinHitSize(candidate);
    expect(after.width, `hit width ${after.width}px, visual was ${before.width}px`).toBeGreaterThanOrEqual(24);
    expect(after.height, `hit height ${after.height}px, visual was ${before.height}px`).toBeGreaterThanOrEqual(24);

    // The visible outline is the object's own rect and must stay exactly
    // that - finding #1 is explicit the hit box grows independently of it.
    // getBox() re-reads the real DOM element (not the invisible pseudo), so
    // an unchanged `before` here already is that proof.
    const stillTiny = await getBox(candidate, 'Delete candidate (after)');
    expect(stillTiny.width).toBeCloseTo(before.width, 1);
    expect(stillTiny.height).toBeCloseTo(before.height, 1);
  });

  test('finding #2: brings the resizer and the shared floating toolbar buttons (including a blackout box\'s delete control) to 44px under a coarse pointer', async ({ page }) => {
    await openRedactTool(page);

    const whiteout = await drawRedaction(page, 'Whiteout', { x: 0.18, y: 0.16 }, { x: 0.4, y: 0.22 });
    await selectRedaction(whiteout);

    const resizer = whiteout.locator('[data-editor-resizer="bottom-right"]');
    const resizerVisual = await getBox(resizer, 'Resizer handle');
    expect(resizerVisual.width, 'resizer visual should stay small - only the hit box grows').toBeLessThan(12);
    const resizerHit = await insetHitSize(resizer);
    expect(resizerHit.width).toBeGreaterThanOrEqual(44);
    expect(resizerHit.height).toBeGreaterThanOrEqual(44);

    // The coarse-pointer box toolbar is a floating pill fixed near the viewport bottom.
    const floatingButton = page.locator('[data-editor-actions] button').first();
    await expect(floatingButton).toBeVisible();
    const actionBar = page.locator('[data-editor-actions]').first();
    const barBox = await getBox(actionBar, 'Box action bar');
    const { viewportHeight, viewportWidth } = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }));
    const gapBelow = viewportHeight - (barBox.y + barBox.height);
    expect(gapBelow, 'pill bottom sits 4-24px above the viewport bottom').toBeGreaterThanOrEqual(4);
    expect(gapBelow, 'pill bottom sits 4-24px above the viewport bottom').toBeLessThanOrEqual(24);
    expect(barBox.x, 'pill is at least 8px inside the left side').toBeGreaterThanOrEqual(8);
    expect(viewportWidth - (barBox.x + barBox.width), 'pill is at least 8px inside the right side').toBeGreaterThanOrEqual(8);
    const selectedBox = await getBox(whiteout, 'Selected box');
    expect(selectedBox.y + selectedBox.height, 'bar does not overlap the selected box').toBeLessThanOrEqual(barBox.y + 1);
    // The pill's controls are real 44px targets by their own bounding boxes;
    // the old 28px-plus-::before-halo design is gone.
    const barControls = actionBar.locator('button, label');
    const controlCount = await barControls.count();
    expect(controlCount).toBeGreaterThan(0);
    for (let i = 0; i < controlCount; i += 1) {
      const control = barControls.nth(i);
      const rect = await getBox(control, `Bar control ${i}`);
      expect(rect.width, `bar control ${i} width`).toBeGreaterThanOrEqual(44);
      expect(rect.height, `bar control ${i} height`).toBeGreaterThanOrEqual(44);
    }

    // Deselect before drawing the next box. The floating toolbar
    // (`[data-editor-actions]`) is a DOM descendant of `.redact-box`, so the
    // page-level draw-start handler's own-box guard treats a press anywhere
    // on it as "clicking an existing box", not a new draw - a still-open
    // toolbar left near the next box's start point ate that mousedown itself
    // (its own Delete button, landed on by coincidence) instead of ever
    // reaching the page, silently deleting the whiteout box underneath this
    // test the first time it was written. Escape unselects (Sign/Redact's
    // Escape-disarms-and-deselects contract - editor.md), and since the
    // floating toolbar is conditionally rendered only while selected
    // (`isSelected`, for every type since the toolbar-parity fix, not just
    // CSS-hidden), a real element count is what actually proves it is gone,
    // not merely `toBeHidden()` (which passes on zero matches too, so it
    // cannot tell "removed" from "never found").
    await page.keyboard.press('Escape');
    await expect(whiteout.locator('[data-editor-actions]')).toHaveCount(0);
    const boxesBeforeBlackout = await page.locator('[class*="redact-box"]').count();
    expect(boxesBeforeBlackout, 'the whiteout box itself must still be here, only deselected').toBe(1);

    // Well clear of the whiteout box (y 0.16-0.22) and of any floating
    // toolbar that could still render near it (offset only
    // TOOLBAR_FLOATING_OFFSET=8px away) - belt and suspenders on top of the
    // Escape above, not a substitute for it. Large enough (40% width, 20%
    // height) that its centre - selectRedaction's click point - stays clear
    // of the delete button's own enlarged 44px hit area in the top-right
    // corner: this finding's own fix widens that corner's *clickable* region
    // well past its visible 24x24, so a small enough box would have its
    // geometric centre land inside that hit area instead of the open middle
    // of the box, selecting nothing and deleting it instead - reproduced
    // while writing this guardrail (the box just above, at only ~22% width,
    // did exactly that).
    const blackout = await drawRedaction(page, 'Blackout', { x: 0.15, y: 0.5 }, { x: 0.55, y: 0.7 });
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(2);
    await selectRedaction(blackout);
    // Blackout's delete control is a real 44px target by its own bounding
    // box, like every other control in the pill.
    const blackoutDelete = page.locator('[data-editor-actions] button[title="Delete"]');
    await expect(blackoutDelete).toBeVisible();
    const blackoutDeleteRect = await getBox(blackoutDelete, 'Blackout toolbar delete button');
    expect(blackoutDeleteRect.width).toBeGreaterThanOrEqual(44);
    expect(blackoutDeleteRect.height).toBeGreaterThanOrEqual(44);
  });
});

// RED-03: "Repeat on every page" - a selected box copied onto every other
// page at the same percentage position/size, in one undo step, and every
// copy stays linked: editing one moves/resizes them all as one undo step.
// repeatGroup.test.ts covers the pure placement/linking logic and
// PdfRedactTool.test.tsx covers the wiring in jsdom; this is the one thing
// neither can prove - that the rendered boxes on differently-scrolled real
// pages really land at the same relative spot, and really move together,
// once the browser lays pages out.
test.describe('repeat a box on every page (RED-03)', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  async function boxRatioWithinPage(pageCard) {
    const overlay = pageCard.locator('.redact-draw-area');
    await overlay.scrollIntoViewIfNeeded();
    const box = pageCard.locator('[class*="redact-box"]');
    const overlayRect = await getBox(overlay, 'page overlay');
    const boxRect = await getBox(box, 'redaction box');
    return {
      left: (boxRect.x - overlayRect.x) / overlayRect.width,
      top: (boxRect.y - overlayRect.y) / overlayRect.height,
      width: boxRect.width / overlayRect.width,
      height: boxRect.height / overlayRect.height,
    };
  }

  test('adds a copy at the same relative position to the other pages, as one undo step', async ({ page }) => {
    await openRedactTool(page, await makeMultiPagePdfBuffer(3));

    const pageCards = page.locator('[data-editor-page-card]');
    await expect(pageCards).toHaveCount(3);

    const blackout = await drawRedaction(page, 'Blackout', { x: 0.2, y: 0.18 }, { x: 0.42, y: 0.28 });
    await selectRedaction(blackout);

    const repeatButton = page.locator('[data-editor-repeat-every-page]');
    await expect(repeatButton).toBeVisible();
    await repeatButton.click();

    await expect(page.locator('[class*="redact-box"]')).toHaveCount(3);

    const sourceRatio = await boxRatioWithinPage(pageCards.nth(0));
    const page2Ratio = await boxRatioWithinPage(pageCards.nth(1));
    const page3Ratio = await boxRatioWithinPage(pageCards.nth(2));

    const TOLERANCE = 0.01; // 1% of the page, per RED-03's acceptance bar
    for (const [label, ratio] of [['page 2', page2Ratio], ['page 3', page3Ratio]]) {
      for (const key of ['left', 'top', 'width', 'height']) {
        expect(Math.abs(ratio[key] - sourceRatio[key]), `${label} ${key}: ${ratio[key]} vs source ${sourceRatio[key]}`)
          .toBeLessThan(TOLERANCE);
      }
    }

    // Linked copies (added 2026-09-27, before RED-03 shipped): dragging a
    // resize handle on the page-2 copy must move every other copy along
    // with it, as one undo step - not just place a copy once and leave it
    // an independent box afterwards.
    const page2Box = pageCards.nth(1).locator('[class*="redact-box"]');
    await selectRedaction(page2Box);
    const handle = page2Box.locator('[data-editor-resizer="bottom-right"]');
    const handleBox = await getBox(handle, 'page 2 copy resize handle');
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 60, handleBox.y + handleBox.height / 2 + 40);
    await page.mouse.up();

    const page1RatioAfterResize = await boxRatioWithinPage(pageCards.nth(0));
    const page2RatioAfterResize = await boxRatioWithinPage(pageCards.nth(1));
    const page3RatioAfterResize = await boxRatioWithinPage(pageCards.nth(2));
    expect(page2RatioAfterResize.width).toBeGreaterThan(sourceRatio.width + 0.02);
    for (const [label, ratio] of [['page 1', page1RatioAfterResize], ['page 3', page3RatioAfterResize]]) {
      for (const key of ['left', 'top', 'width', 'height']) {
        expect(Math.abs(ratio[key] - page2RatioAfterResize[key]), `${label} ${key} should match the resized page 2 copy`)
          .toBeLessThan(TOLERANCE);
      }
    }

    // One keyboard undo reverts the linked resize on every copy, back to
    // matching their pre-resize size and position.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    const page1RatioAfterUndo = await boxRatioWithinPage(pageCards.nth(0));
    for (const key of ['left', 'top', 'width', 'height']) {
      expect(Math.abs(page1RatioAfterUndo[key] - sourceRatio[key])).toBeLessThan(TOLERANCE);
    }

    // A second keyboard undo removes every copy the repeat action added,
    // leaving only the original box on the first page.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
  });
});

// RED-02: find and redact. The finders, reading order and box arithmetic are
// unit-tested under src/tools/redact/find/; this proves what jsdom cannot:
// pdf.js's real text positions land the highlight on the drawn words, and
// "Redact all" adds every box as one undo step.
test.describe('find and redact (RED-02)', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  async function makeFindPdfBuffer() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 2; i += 1) {
      const page = doc.addPage([612, 792]);
      page.drawText('Jane Doe', { x: 100, y: 700, size: 12, font });
      page.drawText(`Signed by Jane Doe on page ${i + 1}.`, { x: 100, y: 600, size: 12, font });
    }
    return Buffer.from(await doc.save());
  }

  test('highlights every match on the drawn words and redacts them all as one undo step', async ({ page }) => {
    await openRedactTool(page, await makeFindPdfBuffer());
    await expect(page.locator('[data-editor-page-card]')).toHaveCount(2);

    await page.locator('[data-redact-find-toggle]').click();
    await page.locator('[data-redact-find-input]').fill('jane doe');
    await expect(page.locator('[data-redact-find-status]')).toHaveText('1 of 4 on 2 pages');

    // The first match is "Jane Doe" at (100, 700) in PDF points, 12pt: its
    // highlight's left edge sits at 100/612 of the page and its top just
    // above the cap height, 1pt of padding included.
    const pageCard = page.locator('[data-editor-page-card]').first();
    // Find smoothly scrolls to the current match. Read both rectangles in the
    // same browser evaluation so scrolling cannot move one between reads.
    const matchWithinPage = await pageCard.evaluate((card) => {
      const overlay = card.querySelector('.redact-draw-area')?.getBoundingClientRect();
      const match = card.querySelector('[data-redact-find-match]')?.getBoundingClientRect();
      if (!overlay || !match) throw new Error('Find match or page overlay has no bounding box');
      return {
        x: (match.x - overlay.x) / overlay.width,
        y: (match.y - overlay.y) / overlay.height,
        height: match.height / overlay.height,
      };
    });
    expect(Math.abs(matchWithinPage.x - 99 / 612)).toBeLessThan(0.01);
    expect(Math.abs(matchWithinPage.y - (792 - 713) / 792)).toBeLessThan(0.01);
    expect(matchWithinPage.height).toBeGreaterThan(12 / 792);

    await page.locator('[data-redact-find-all]').click();
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(4);
    await expect(page.locator('[data-redact-find-status]')).toHaveText('1 of 4 on 2 pages, 4 covered');
    await expect(page.locator('[data-redact-find-all]')).toBeDisabled();

    await expect(page.getByText('Covered 4 matches', { exact: true })).toBeVisible();
    await page.locator('[role="toolbar"][aria-label="PDF redaction"]').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(0);
    await expect(page.locator('[data-redact-find-all]')).toHaveText('Cover all 4');
  });

  // RED-11: the four boxes "Redact all" just added share one findSetId, so
  // trash on any one of them offers to remove the whole search's boxes in a
  // single step - and leaves an unrelated box, drawn afterwards, untouched.
  test('trash offers "All N from this search", removes exactly those boxes, and Undo restores them', async ({ page }) => {
    await openRedactTool(page, await makeFindPdfBuffer());
    await page.locator('[data-redact-find-toggle]').click();
    await page.locator('[data-redact-find-input]').fill('jane doe');
    await expect(page.locator('[data-redact-find-status]')).toHaveText('1 of 4 on 2 pages');

    await page.locator('[data-redact-find-all]').click();
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(4);

    // An ordinary box, drawn after the search - well below the matched text
    // (y ratio 0.6) so it does not overlap any found box.
    await drawRedaction(page, 'Blackout', { x: 0.5, y: 0.6 }, { x: 0.7, y: 0.66 });
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(5);

    const found = page.locator('[class*="redact-box"]').first();
    await selectRedaction(found);
    await page.locator('[data-editor-delete-scope-trigger]').click();
    await page.locator('[data-editor-delete-find-set]').click();

    // The one box left is the drawn one: it starts halfway across the page,
    // where no "Jane Doe" match does.
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
    const overlay = await getBox(page.locator('.redact-draw-area').first(), 'page overlay');
    const survivor = await getBox(page.locator('[class*="redact-box"]').first(), 'drawn box');
    expect(Math.abs((survivor.x - overlay.x) / overlay.width - 0.5)).toBeLessThan(0.02);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(5);
  });
});

// RED-13: "what you see is what you save" for the Delete tool - the page is
// redrawn from a one-page PDF with the marked object spliced out
// (useDeletePreviews.ts), so a deleted object must actually vanish from the
// rendered canvas, come back on Undo, be gone from the download, and never be
// left showing a previous file's preview after Replace file.
test.describe('delete shows the page as it will be saved (RED-13)', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  async function makeDeleteFixturePdfBuffer() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // Two separate drawText calls are two separate BT/ET runs, so the Delete
    // tool offers them as two independent candidates - and far apart
    // vertically so their canvas regions never overlap.
    page.drawText('KEEP ME', { x: 40, y: 320, size: 20, font, color: rgb(0, 0, 0) });
    page.drawText('SECRET 123', { x: 40, y: 80, size: 20, font, color: rgb(0, 0, 0) });
    return Buffer.from(await doc.save());
  }

  // The candidate div for a marked object is gone the instant it's clicked
  // (DeletableObjectOverlay only renders unmarked objects), so its rect has
  // to be captured, as a fraction of the page overlay, before that click.
  async function ratioRectWithin(overlay, locator) {
    const overlayBox = await getBox(overlay, 'page overlay');
    const elBox = await getBox(locator, 'delete candidate');
    return {
      left: (elBox.x - overlayBox.x) / overlayBox.width,
      top: (elBox.y - overlayBox.y) / overlayBox.height,
      width: elBox.width / overlayBox.width,
      height: elBox.height / overlayBox.height,
    };
  }

  // Reads real pixels back out of the live pdf.js canvas (not a copy) for the
  // rect a candidate reported, scaled from CSS fractions to canvas pixels.
  // `dark` proves text is/isn't painted there; `avgR`/`avgB` distinguish the
  // marker square the file-switch test below uses; `hash` proves the region's
  // bytes are unchanged across an unrelated edit.
  async function canvasRegionStats(pageCard, ratioRect) {
    const canvas = pageCard.locator('canvas').first();
    return canvas.evaluate((canvasEl, rect) => {
      const ctx = canvasEl.getContext('2d');
      const x = Math.max(0, Math.round(rect.left * canvasEl.width));
      const y = Math.max(0, Math.round(rect.top * canvasEl.height));
      const w = Math.max(1, Math.min(canvasEl.width - x, Math.round(rect.width * canvasEl.width)));
      const h = Math.max(1, Math.min(canvasEl.height - y, Math.round(rect.height * canvasEl.height)));
      const { data } = ctx.getImageData(x, y, w, h);
      let dark = 0;
      let hash = 0;
      let sumR = 0;
      let sumB = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r < 200 || g < 200 || b < 200) dark += 1;
        sumR += r;
        sumB += b;
        hash = (hash * 31 + r * 65536 + g * 256 + b) >>> 0;
      }
      return { dark, hash, avgR: sumR / pixels, avgB: sumB / pixels };
    }, ratioRect);
  }

  test('a deleted text run disappears from the canvas, keeps the rest, and Undo brings it back', async ({ page }) => {
    await openRedactTool(page, await makeDeleteFixturePdfBuffer());
    await selectRedactStyle(page, 'Delete');

    const pageCard = page.locator('[data-editor-page-card]').first();
    const overlay = pageCard.locator('.redact-draw-area');
    const secretCandidate = page.locator('[class*="delete-candidate"][title*="SECRET 123"]');
    const keepCandidate = page.locator('[class*="delete-candidate"][title*="KEEP ME"]');
    await expect(secretCandidate).toBeVisible();
    await expect(keepCandidate).toBeVisible();

    const secretRatio = await ratioRectWithin(overlay, secretCandidate);
    const keepRatio = await ratioRectWithin(overlay, keepCandidate);

    const secretBefore = await canvasRegionStats(pageCard, secretRatio);
    const keepBefore = await canvasRegionStats(pageCard, keepRatio);
    expect(secretBefore.dark, 'fixture should actually paint dark pixels for SECRET 123').toBeGreaterThan(0);
    expect(keepBefore.dark, 'fixture should actually paint dark pixels for KEEP ME').toBeGreaterThan(0);

    await secretCandidate.click();

    await expect.poll(async () => (await canvasRegionStats(pageCard, secretRatio)).dark)
      .toBeLessThan(secretBefore.dark * 0.1);
    // The unrelated run must be untouched by rewriting the other one out.
    const keepAfterDelete = await canvasRegionStats(pageCard, keepRatio);
    expect(keepAfterDelete.dark).toBeGreaterThan(keepBefore.dark * 0.8);

    await expect(page.getByText('Deleted text', { exact: true })).toBeVisible();
    await page.locator('[role="toolbar"][aria-label="PDF redaction"]').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await canvasRegionStats(pageCard, secretRatio)).dark)
      .toBeGreaterThan(secretBefore.dark * 0.8);
  });

  test('download after deleting a run saves a page with that text spliced out', async ({ page }) => {
    await openRedactTool(page, await makeDeleteFixturePdfBuffer());
    await selectRedactStyle(page, 'Delete');
    await page.locator('[class*="delete-candidate"][title*="SECRET 123"]').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    const savedPath = await download.path();
    if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
    const saved = await PDFDocument.load(fs.readFileSync(savedPath));
    const text = decodedPageText(saved.getPage(0));
    expect(text).toContain('KEEP ME');
    expect(text).not.toContain('SECRET');
  });

  // The real browser path (pdf.js rendering on a real canvas, its worker,
  // the operator-list read) that redact.test.js can only run against a
  // stubbed canvas. A covered page is saved as one picture with no text
  // layer at all (2026-09-28), whether or not a box lands on any of its text.
  test('download after a blackout over a middle word saves the covered page with no text at all', async ({ page }) => {
    const doc = await PDFDocument.create();
    const pdfPage = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const size = 24;
    const baseline = 400;
    pdfPage.drawText('LEFT MIDDLE RIGHT', { x: 72, y: baseline, size, font });
    const x0 = 72 + font.widthOfTextAtSize('LEFT ', size) + 2;
    const x1 = 72 + font.widthOfTextAtSize('LEFT MIDDLE', size) + 1;
    await openRedactTool(page, Buffer.from(await doc.save()));

    await drawRedaction(
      page,
      'Blackout',
      { x: x0 / 612, y: (792 - baseline - size) / 792 },
      { x: x1 / 612, y: (792 - baseline + 0.2 * size) / 792 },
    );
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    const savedPath = await download.path();
    if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');

    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const wasmUrl = `${new URL('../../../../node_modules/pdfjs-dist/wasm/', import.meta.url).href}`;
    const saved = await getDocument({ data: new Uint8Array(fs.readFileSync(savedPath)), wasmUrl }).promise;
    const content = await (await saved.getPage(1)).getTextContent();
    expect(content.items).toEqual([]);
  });

  // RED-17: the saved-file check's done-state flow, in a real browser (pdf.js
  // reading the saved bytes back). "SECRET" appears twice; only the first is
  // boxed, so the check should still surface the second one under the same
  // term, offer "Cover it", and clear itself once that cover makes the export
  // stale again.
  test('the saved-file check finds an uncovered repeat of a boxed word and Cover it covers it', async ({ page }) => {
    const doc = await PDFDocument.create();
    const pdfPage = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const size = 18;
    const baseline1 = 700;
    const baseline2 = 660;
    pdfPage.drawText('SECRET alpha', { x: 72, y: baseline1, size, font });
    pdfPage.drawText('bravo SECRET charlie', { x: 72, y: baseline2, size, font });
    const x0 = 72 - 2;
    const x1 = 72 + font.widthOfTextAtSize('SECRET', size) + 1;
    await openRedactTool(page, Buffer.from(await doc.save()));

    await drawRedaction(
      page,
      'Blackout',
      { x: x0 / 612, y: (792 - baseline1 - size) / 792 },
      { x: x1 / 612, y: (792 - baseline1 + 0.2 * size) / 792 },
    );
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Download', exact: true }).click(),
    ]);

    const check = page.locator('[data-saved-file-check]');
    await expect(check).toBeVisible();
    const secretTerm = check.locator('[data-check-term="SECRET"]');
    await expect(secretTerm).toContainText('Page 1: still visible in the picture.');
    const coverButton = secretTerm.getByRole('button', { name: 'Add a box over it' });
    await expect(coverButton).toBeVisible();

    await coverButton.click();

    await expect(page.locator('[class*="redact-box"]')).toHaveCount(2);
    await expect(page.locator('[data-saved-file-check]')).toHaveCount(0);
  });

  // A reviewer found that a Blur box overlapping an earlier Blackout pasted
  // the original page's pixels back over the Blackout in the exported
  // picture (flattenPage in redact.js sampled the page for the blur before
  // any box was painted). Fixed by painting solids before a blur samples the
  // page, and again after every blur. Proves it in the actual exported
  // pixels: a solid red top half with black text, a Blackout, then a Blur
  // whose right half overlaps the Blackout and extends past it into plain
  // red. Both the Blackout-only region and the overlap must read solid
  // black; only the blur-over-red region, which the Blackout never touched,
  // may show red through.
  test('exported picture: a blur overlapping a blackout leaves the blackout solid', async ({ page }) => {
    const doc = await PDFDocument.create();
    const pdfPage = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    pdfPage.drawRectangle({ x: 0, y: 396, width: 612, height: 396, color: rgb(1, 0, 0) });
    pdfPage.drawText('CONFIDENTIAL', { x: 420, y: 750, size: 20, font, color: rgb(0, 0, 0) });
    await openRedactTool(page, Buffer.from(await doc.save()));

    // Blackout, then a Blur whose right half overlaps it and extends past it.
    // The drag must start off the just-drawn (and now selected) Blackout box,
    // or the mousedown hits the box itself instead of the draw overlay, so
    // the Blur drag starts from its own bottom-right corner, outside the
    // Blackout, and ends inside the overlap.
    await drawRedaction(page, 'Blackout', { x: 0.3, y: 0.15 }, { x: 0.5, y: 0.35 });
    await drawRedaction(page, 'Blur', { x: 0.65, y: 0.35 }, { x: 0.4, y: 0.15 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    const savedPath = await download.path();
    if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
    const saved = await PDFDocument.load(fs.readFileSync(savedPath));
    const jpegBase64 = Buffer.from(extractFlattenedJpegBytes(saved.getPage(0))).toString('base64');

    const [blackoutOnly, overlap, blurOnly] = await page.evaluate(async ({ base64, points }) => {
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
        const [r, g, b] = ctx.getImageData(
          Math.round(x * canvas.width),
          Math.round(y * canvas.height),
          1,
          1,
        ).data;
        return { r, g, b };
      });
    }, {
      base64: jpegBase64,
      points: [
        { x: 0.35, y: 0.25 }, // centre of the blackout-only part
        { x: 0.45, y: 0.25 }, // centre of the blackout-and-blur overlap
        { x: 0.58, y: 0.25 }, // blur-only, over plain red
      ],
    });

    for (const sample of [blackoutOnly, overlap]) {
      expect(sample.r).toBeLessThanOrEqual(40);
      expect(sample.g).toBeLessThanOrEqual(40);
      expect(sample.b).toBeLessThanOrEqual(40);
    }
    expect(blurOnly.r).toBeGreaterThan(100);
  });

  test('after Replace file, a deletion at the same byte offsets draws the new file, not the old one', async ({ page }) => {
    // Same-length strings at the same positions on both files: the two BT/ET
    // runs land at matching byte offsets in each file's own content stream.
    // Replace clears the old file's deletions before the new file opens,
    // which already drops the old preview, so this does not reach
    // useDeletePreviews.ts's keysFileRef guard (checked: it passes with that
    // guard disabled). That guard is for a file that arrives with deletions
    // already queued, a reopened draft. The colour square is the only difference between the two fixtures, and
    // is what proves which file's bytes the canvas is actually showing.
    async function makeMarkedPdfBuffer(markerColor) {
      const doc = await PDFDocument.create();
      const pdfPage = doc.addPage([300, 400]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      pdfPage.drawText('AAAA 111', { x: 40, y: 320, size: 20, font, color: rgb(0, 0, 0) });
      pdfPage.drawText('BBBB 222', { x: 40, y: 80, size: 20, font, color: rgb(0, 0, 0) });
      pdfPage.drawRectangle({ x: 220, y: 20, width: 40, height: 40, color: markerColor });
      return Buffer.from(await doc.save());
    }
    // Fixed from the fixtures' own known PDF-point geometry (not a delete
    // candidate, so there is no DOM element to measure).
    const MARKER_RATIO = { left: 220 / 300, top: (400 - 60) / 400, width: 40 / 300, height: 40 / 400 };

    const fileA = await makeMarkedPdfBuffer(rgb(0.8, 0, 0));
    const fileB = await makeMarkedPdfBuffer(rgb(0, 0, 0.8));

    await openRedactTool(page, fileA);
    await selectRedactStyle(page, 'Delete');

    const pageCard = page.locator('[data-editor-page-card]').first();
    const overlay = pageCard.locator('.redact-draw-area');
    const firstRunRatioA = await ratioRectWithin(overlay, page.locator('[class*="delete-candidate"][title*="AAAA 111"]'));
    const markerA = await canvasRegionStats(pageCard, MARKER_RATIO);
    expect(markerA.avgR, 'file A\'s marker should read red').toBeGreaterThan(markerA.avgB);

    await page.locator('[class*="delete-candidate"][title*="BBBB 222"]').click();
    await expect.poll(async () => (await canvasRegionStats(pageCard, firstRunRatioA)).dark).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Replace file', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Open a different file?' })).toBeVisible();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose a file', exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({ name: 'delete-fileB.pdf', mimeType: 'application/pdf', buffer: fileB });
    await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();

    const pageCardB = page.locator('[data-editor-page-card]').first();
    const overlayB = pageCardB.locator('.redact-draw-area');
    // File B's marker must already read blue, before any deletion happens on
    // it - proof the switch itself painted B, not a leftover frame of A.
    await expect.poll(async () => {
      const markerB = await canvasRegionStats(pageCardB, MARKER_RATIO);
      return markerB.avgB > markerB.avgR;
    }, { message: 'file B\'s marker should read blue once the switch has painted' }).toBe(true);

    // Marking on file A spent Delete's one arming; arm it again for file B.
    await selectRedactStyle(page, 'Delete');
    const firstRunRatioB = await ratioRectWithin(overlayB, page.locator('[class*="delete-candidate"][title*="AAAA 111"]'));
    const baselineB = await canvasRegionStats(pageCardB, firstRunRatioB);
    expect(baselineB.dark, 'file B should still show its own first run before deleting anything').toBeGreaterThan(0);

    await page.locator('[class*="delete-candidate"][title*="BBBB 222"]').click();

    // Deleting B's second run must leave B's first run and marker exactly as
    // they were - not fall back to file A's stale preview for either region.
    await expect.poll(async () => (await canvasRegionStats(pageCardB, firstRunRatioB)).dark)
      .toBeGreaterThan(baselineB.dark * 0.8);
    const afterB = await canvasRegionStats(pageCardB, firstRunRatioB);
    expect(afterB.hash).toBe(baselineB.hash);
    const markerAfterB = await canvasRegionStats(pageCardB, MARKER_RATIO);
    expect(markerAfterB.avgB, 'canvas must still be file B\'s, not file A\'s').toBeGreaterThan(markerAfterB.avgR);
  });
});

import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

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
    await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
  } catch (error) {
    throw new Error(
      `Redact workspace did not appear after selecting a PDF.\nBrowser messages:\n${browserMessages.join('\n') || '(none)'}\n\n${error.message}`,
    );
  }
  await expect(page.locator('.redact-draw-area')).toBeVisible();
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
  // floating toolbar (ElementToolbar via RedactBox's `[data-editor-actions]`
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
      await expect(toolbar.getByRole('button', { name: 'Delete element' })).toBeVisible();
      // Whiteout is the only type with a per-element colour control - its
      // toolbar carries one extra button (colour trigger, duplicate, delete)
      // over blackout/blur's two (duplicate, delete).
      await expect(toolbar.locator('button')).toHaveCount(3);
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
      await expect(toolbar.getByRole('button', { name: 'Delete element' })).toBeVisible();
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
      await expect(toolbar.getByRole('button', { name: 'Delete element' })).toBeVisible();
      await expect(toolbar.locator('button'), 'blur has no colour control - only duplicate and delete').toHaveCount(2);
      const boxRect = await getBox(blur, 'blur box');
      const toolbarRect = await getBox(toolbar, 'blur toolbar');
      offsetAboveBoxTop.blur = boxRect.y - (toolbarRect.y + toolbarRect.height);
    }

    await dragBy(page, blur, 2000, -2000);
    await expectWithinPage(blur, overlay);

    // eslint-disable-next-line no-console -- deliberate: the offsets are part of this guardrail's evidence.
    console.log('Redact selection-toolbar offset above box top (px):', offsetAboveBoxTop);
    expect(offsetAboveBoxTop.blackout).toBeCloseTo(offsetAboveBoxTop.whiteout, 0);
    expect(offsetAboveBoxTop.blur).toBeCloseTo(offsetAboveBoxTop.whiteout, 0);
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
// `.delete-mark-btn::before`, `.resizer::before`, `.element-button::before`)
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

  // The centred `min-width`/`min-height` technique `.delete-candidate` and
  // `.delete-mark-btn` use instead: unlike the resizer/toolbar controls, this
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

    const floatingButton = whiteout.locator('[data-editor-actions] button').first();
    await expect(floatingButton).toBeVisible();
    const floatingVisual = await getBox(floatingButton, 'Floating toolbar button');
    const floatingHit = await insetHitSize(floatingButton);
    expect(floatingHit.width, `visual was ${floatingVisual.width}px`).toBeGreaterThanOrEqual(44);
    expect(floatingHit.height, `visual was ${floatingVisual.height}px`).toBeGreaterThanOrEqual(44);

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
    // Blackout's delete control is now the shared floating toolbar's own
    // `.element-button` (E7.5's toolbar-parity fix), not a Redact-only
    // `.redact-element-btn` - so it gets the same `.element-button::before`
    // 44px floor whiteout's toolbar buttons already got above, proven the
    // same way (visual stays ~28px, only the hit box grows).
    const blackoutDelete = blackout.locator('[data-editor-actions] button[title="Delete element"]');
    await expect(blackoutDelete).toBeVisible();
    const blackoutDeleteVisual = await getBox(blackoutDelete, 'Blackout toolbar delete button');
    expect(blackoutDeleteVisual.width, 'delete button visual should stay ~28px - only the hit box grows').toBeLessThan(32);
    const blackoutDeleteHit = await insetHitSize(blackoutDelete);
    expect(blackoutDeleteHit.width, `visual was ${blackoutDeleteVisual.width}px`).toBeGreaterThanOrEqual(44);
    expect(blackoutDeleteHit.height, `visual was ${blackoutDeleteVisual.height}px`).toBeGreaterThanOrEqual(44);
  });
});

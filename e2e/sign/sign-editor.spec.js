import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Sign tool e2e fixture', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('The PDF stays local in the browser.', {
    x: 72,
    y: 690,
    size: 12,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  return Buffer.from(await doc.save());
}

// Collects the browser's own securitypolicyviolation events (structured,
// spec-defined, cross-engine) rather than scraping console text — see E1.7
// in scrum.md. Installed via addInitScript so it's listening before any
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

async function openSignTool(page) {
  const browserMessages = [];
  page.on('console', (message) => {
    browserMessages.push(`[${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    browserMessages.push(`[pageerror] ${error.message}`);
  });

  await collectCspViolations(page);
  await page.goto('/sign');
  // Wait for the client:load island to finish hydrating before touching the file
  // input. The <input type=file> opens the OS picker even unhydrated, but its
  // Preact onChange only attaches after hydration — an early setFiles is silently
  // dropped and the workspace never renders (the intermittent 10s timeout).
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'sign-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  try {
    await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
  } catch (error) {
    throw new Error(
      `Sign workspace did not appear after selecting a PDF.\nBrowser messages:\n${browserMessages.join('\n') || '(none)'}\n\n${error.message}`,
    );
  }
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

async function clickOverlayAt(page, xRatio, yRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
}

async function addText(page, text, xRatio, yRatio) {
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') {
    await textTool.click();
  }
  await clickOverlayAt(page, xRatio, yRatio);
  const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
  await expect(input).toBeVisible();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  return page.locator('[data-editor-element][data-editor-active]');
}

async function addWhiteout(page, startRatio, endRatio) {
  const whiteoutTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Whiteout', exact: true });
  if ((await whiteoutTool.getAttribute('aria-pressed')) !== 'true') {
    await whiteoutTool.click();
  }
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y);
  await page.mouse.up();
  const whiteout = page.locator('[data-editor-element][data-editor-shape]').last();
  await expect(whiteout).toBeVisible();
  return whiteout;
}

async function elementAndToolbarBoxes(element) {
  const toolbar = element.locator('[data-editor-actions]');
  await expect(toolbar).toBeVisible();
  const elementBox = await element.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  if (!elementBox || !toolbarBox) throw new Error('Element or toolbar has no bounding box');
  return { elementBox, toolbarBox };
}

async function addSymbol(page, xRatio, yRatio) {
  const symbolTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Symbols', exact: true });
  if ((await symbolTool.getAttribute('aria-pressed')) !== 'true') {
    await symbolTool.click();
  }
  await clickOverlayAt(page, xRatio, yRatio);
  const placed = page.locator('[data-editor-element][data-editor-active]');
  await expect(placed).toBeVisible();
  return placed.getAttribute('data-editor-element-id');
}

test.describe('Sign editor browser guardrails', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
  });

  // Real hit testing only: jsdom has no layout, so it cannot see an element
  // claiming pixels outside its own box. There used to be an invisible 44px
  // strip above every element (a bridge to a then-hover-revealed toolbar), and
  // because siblings share z-index, a later-placed element below would win a
  // click aimed at the element above it.
  test('selects the element actually under the pointer, not a neighbour below it', async ({ page }) => {
    await openSignTool(page);

    const upperId = await addSymbol(page, 0.5, 0.4);
    // Placed second (so it paints above) and below the first, close enough that
    // the old strip above it covered the upper symbol.
    const lowerId = await addSymbol(page, 0.5, 0.44);
    expect(upperId).not.toBe(lowerId);

    // Escape clears both the tool and the selection, so the lower symbol's own
    // (visible, legitimately clickable) toolbar isn't what's under the pointer.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(0);

    const upper = page.locator(`[data-editor-element-id="${upperId}"]`);
    const box = await upper.boundingBox();
    if (!box) throw new Error('Upper symbol has no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(upper).toHaveAttribute('data-editor-active', 'true');
    await expect(page.locator(`[data-editor-element-id="${lowerId}"]`)).not.toHaveAttribute('data-editor-active', 'true');
  });

  // Only a real browser can prove this one: the textarea covers the whole box,
  // and what keeps a plain click from landing in it is `pointer-events: none`,
  // which jsdom does not implement. Under jsdom the click would reach the
  // wrapper either way, so the guard would pass there even if the CSS were
  // deleted.
  test('a plain click selects a text box, and only a double click puts the caret in it', async ({ page }) => {
    await openSignTool(page);

    const element = await addText(page, 'Hello', 0.4, 0.4);
    const input = element.locator('[data-editor-text-input]');
    await expect(input).toBeFocused();

    // First Escape ends the edit session and leaves the box selected.
    await page.keyboard.press('Escape');
    await expect(element).toHaveAttribute('data-editor-active', 'true');
    await expect(input).not.toBeFocused();

    const box = await element.boundingBox();
    if (!box) throw new Error('Text element has no bounding box');
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.click(centre.x, centre.y);
    await expect(element).toHaveAttribute('data-editor-active', 'true');
    await expect(input).not.toBeFocused();

    await page.mouse.dblclick(centre.x, centre.y);
    await expect(input).toBeFocused();
  });

  test('keeps toolbar positioning stable and whiteout defaults separate in the real browser', async ({ page }) => {
    await openSignTool(page);

    const ltr = await addText(page, 'hello', 0.35, 0.38);
    const ltrBoxes = await elementAndToolbarBoxes(ltr);

    expect(ltrBoxes.toolbarBox.y + ltrBoxes.toolbarBox.height).toBeLessThanOrEqual(ltrBoxes.elementBox.y + 2);
    expect(Math.abs(ltrBoxes.toolbarBox.x - ltrBoxes.elementBox.x)).toBeLessThanOrEqual(4);

    const rtl = await addText(page, 'שלום', 0.82, 0.52);
    const rtlBoxes = await elementAndToolbarBoxes(rtl);
    const toolbarRight = rtlBoxes.toolbarBox.x + rtlBoxes.toolbarBox.width;
    const elementRight = rtlBoxes.elementBox.x + rtlBoxes.elementBox.width;

    expect(rtlBoxes.toolbarBox.y + rtlBoxes.toolbarBox.height).toBeLessThanOrEqual(rtlBoxes.elementBox.y + 2);
    expect(Math.abs(toolbarRight - elementRight)).toBeLessThanOrEqual(4);

    await rtl.locator('button[title="Text color"]').click();
    await page.locator('[data-editor-color-menu] [data-editor-color-swatch][title="#d8342b"]').click();
    await expect(rtl.locator('[data-editor-text-input]')).toHaveCSS('color', 'rgb(216, 52, 43)');

    const whiteout = await addWhiteout(page, { x: 0.28, y: 0.52 }, { x: 0.42, y: 0.59 });
    const fill = whiteout.locator('> div:not([data-editor-actions])');
    await expect(fill).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    const before = await elementAndToolbarBoxes(whiteout);

    await page.mouse.move(before.elementBox.x + before.elementBox.width / 2, before.elementBox.y + before.elementBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      before.elementBox.x + before.elementBox.width / 2 + 90,
      before.elementBox.y + before.elementBox.height / 2 + 45,
    );

    const during = await elementAndToolbarBoxes(whiteout);
    expect(during.elementBox.x - before.elementBox.x).toBeGreaterThan(70);
    expect(during.toolbarBox.x - before.toolbarBox.x).toBeGreaterThan(70);
    expect(Math.abs((during.toolbarBox.x - before.toolbarBox.x) - (during.elementBox.x - before.elementBox.x))).toBeLessThanOrEqual(6);

    await page.mouse.up();
  });
});

test.describe('Sign editor touch gesture guardrail', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('prevents native scrolling during a drag-drawn creation gesture', async ({ page }) => {
    await openSignTool(page);
    const whiteoutTool = page
      .getByRole('toolbar', { name: 'PDF annotations' })
      .getByRole('button', { name: 'Whiteout', exact: true });
    await whiteoutTool.click();

    const prevented = await page.locator('[class*="page-overlay"]').first().evaluate((overlay) => {
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

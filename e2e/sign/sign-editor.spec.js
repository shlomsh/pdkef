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
    await expect(page.locator('.sign-page-wrapper')).toBeVisible();
  } catch (error) {
    throw new Error(
      `Sign workspace did not appear after selecting a PDF.\nBrowser messages:\n${browserMessages.join('\n') || '(none)'}\n\n${error.message}`,
    );
  }
  await expect(page.locator('.sign-page-overlay')).toBeVisible();
}

async function clickOverlayAt(page, xRatio, yRatio) {
  const overlay = page.locator('.sign-page-overlay').first();
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
  const input = page.locator('.sign-element.active .sign-text-input');
  await expect(input).toBeVisible();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  return page.locator('.sign-element.active');
}

async function addWhiteout(page, startRatio, endRatio) {
  const whiteoutTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Whiteout', exact: true });
  if ((await whiteoutTool.getAttribute('aria-pressed')) !== 'true') {
    await whiteoutTool.click();
  }
  const overlay = page.locator('.sign-page-overlay').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y);
  await page.mouse.up();
  const whiteout = page.locator('.sign-element.sign-element--shape').last();
  await expect(whiteout).toBeVisible();
  return whiteout;
}

async function elementAndToolbarBoxes(element) {
  const toolbar = element.locator('.sign-element-actions');
  await expect(toolbar).toBeVisible();
  const elementBox = await element.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  if (!elementBox || !toolbarBox) throw new Error('Element or toolbar has no bounding box');
  return { elementBox, toolbarBox };
}

test.describe('Sign editor browser guardrails', () => {
  test.afterEach(async ({ page }) => {
    await assertNoCspViolations(page);
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
    await page.locator('.sign-color-menu .sign-color-swatch[title="#d8342b"]').click();
    await expect(rtl.locator('.sign-text-input')).toHaveCSS('color', 'rgb(216, 52, 43)');

    const whiteout = await addWhiteout(page, { x: 0.28, y: 0.52 }, { x: 0.42, y: 0.59 });
    const fill = whiteout.locator('> div:not(.sign-element-actions)');
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

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

async function openRedactTool(page) {
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
    buffer: await makePdfBuffer(),
  });

  try {
    await expect(page.locator('.sign-page-wrapper')).toBeVisible();
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
  const beforeCount = await page.locator('.redact-box').count();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');

  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 6 });
  await page.waitForTimeout(50);
  await page.mouse.up();

  await expect(page.locator('.redact-box')).toHaveCount(beforeCount + 1);
  const redaction = page.locator('.redact-box').nth(beforeCount);
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

  test('keeps blackout controls reachable, resizable, and page-bound in the real browser', async ({ page }) => {
    await openRedactTool(page);

    const overlay = page.locator('.redact-draw-area').first();

    const blackout = await drawRedaction(page, 'Blackout', { x: 0.18, y: 0.22 }, { x: 0.38, y: 0.31 });
    await selectRedaction(blackout);
    await expect(blackout.locator('.sign-element-resizer')).toHaveCount(8);

    await blackout.hover();
    const blackoutBox = await getBox(blackout, 'Blackout box');
    const redDelete = blackout.locator('.redact-element-btn');
    await expect(redDelete).toBeVisible();
    const redDeleteBox = await getBox(redDelete, 'Blackout delete button');
    expect(redDeleteBox.x).toBeGreaterThanOrEqual(blackoutBox.x);
    expect(redDeleteBox.y).toBeGreaterThanOrEqual(blackoutBox.y);
    expect(redDeleteBox.x + redDeleteBox.width).toBeLessThanOrEqual(blackoutBox.x + blackoutBox.width);
    expect(redDeleteBox.y + redDeleteBox.height).toBeLessThanOrEqual(blackoutBox.y + blackoutBox.height);

    const beforeResize = await getBox(blackout, 'Blackout before resize');
    const bottomRight = blackout.locator('.sign-element-resizer.corner.bottom-right');
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

    await dragBy(page, blackout, 2000, -2000);
    await expectWithinPage(blackout, overlay);
  });

  test('gives blur redactions the same eight page-bounded resize handles', async ({ page }) => {
    await openRedactTool(page);

    const overlay = page.locator('.redact-draw-area').first();
    const blur = await drawRedaction(page, 'Blur', { x: 0.2, y: 0.39 }, { x: 0.36, y: 0.48 });
    await selectRedaction(blur);
    await expect(blur.locator('.sign-element-resizer')).toHaveCount(8);

    await dragBy(page, blur, 2000, -2000);
    await expectWithinPage(blur, overlay);
  });

  test('uses the floating toolbar and independent white fill for whiteout redactions', async ({ page }) => {
    await openRedactTool(page);

    const whiteout = await drawRedaction(page, 'Whiteout', { x: 0.18, y: 0.22 }, { x: 0.38, y: 0.31 });
    await selectRedaction(whiteout);
    await expect(whiteout.locator('.sign-element-resizer')).toHaveCount(8);
    await expect(whiteout.locator('.redact-element-btn')).toHaveCount(0);
    await expect(whiteout).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    const floatingToolbar = whiteout.locator('.sign-element-actions');
    await expect(floatingToolbar).toBeVisible();
    await expect(floatingToolbar.getByRole('button', { name: 'Delete element' })).toBeVisible();
  });
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * SIGN-30 follow-up: a real double-click has a real gap between its two
 * clicks (roughly 100-400ms, whatever the OS's multi-click window allows),
 * not the ~0ms Playwright's own `locator.dblclick()` fires them at. Anything
 * time-based between the clicks - a CSS transition, the ArmHint teaching
 * bubble, a status-row height change, a `setTimeout`-driven re-render - gets
 * a real window to run in that a synthetic instant double-click never
 * exercises. This file drives the two clicks by hand, with an explicit gap,
 * against both Sign and Redact (the shared `toolArming.js`/
 * `EditorToolStatus.tsx` path both toolbars sit on), so it belongs under the
 * cross-tool `e2e/` per rule 7 of docs/module-boundaries.md, not either
 * tool's own `e2e/` folder.
 *
 * One realistic gap (250ms) per plain tool is enough to prove the timing
 * itself isn't the hazard (measured clean at 120/250/400ms and with a
 * pre-hover in the investigation that produced this file - see SIGN-30's
 * ticket body); the case that actually broke under a real gap was the
 * field-nav toolbar shift on a document with detected fields, which is the
 * one worth a dedicated, slower-timing test.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS_FIXTURE = path.resolve(
  here, '..', '..', 'src', 'tools', 'sign', 'fields', '__fixtures__',
  'income-tax-101-page1-geometry.pdf',
);

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Toolbar timed double-click fixture', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function openTool(page, path_, toolbarName, overlaySelector, buffer = null) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await page.goto(path_);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'timed-dblclick.pdf', mimeType: 'application/pdf', buffer: buffer || await makePdfBuffer() });
  await page.locator(overlaySelector).first().waitFor();
  return page.getByRole('toolbar', { name: toolbarName });
}

/**
 * The two clicks of a real double-click, fired with an explicit gap between
 * them. `clickCount` has to be passed explicitly on each `mouse.down()`/
 * `mouse.up()` pair - CDP does not infer it from timing the way a real OS
 * does, so two ordinary single clicks (both `clickCount: 1`) never reach the
 * button's own `e.detail >= 2` branch (`toolArming.js`'s `makeArmTool`) no
 * matter how close together they land; that is a real difference from
 * `locator.dblclick()`, which always sends `clickCount: 1` then `2`.
 */
async function timedDoubleClick(page, locator, gapMs) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Target has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ clickCount: 1 });
  await page.mouse.up({ clickCount: 1 });
  await page.waitForTimeout(gapMs);
  await page.mouse.move(x, y);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
}

function lockSwitch(page) {
  return page.getByRole('switch');
}

async function drag(page, overlay, startRatio, endRatio) {
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 5 });
  await page.mouse.up();
}

test.describe('A real double-click (with a human-scale gap) locks the tool, on both toolbars', () => {
  test('Sign: Whiteout locks across two drags with a 250ms gap between clicks', async ({ page }) => {
    const toolbar = await openTool(page, '/sign?next=0', 'PDF annotations', '[class*="page-overlay"]');
    const btn = toolbar.getByRole('button', { name: 'Whiteout', exact: true });

    await timedDoubleClick(page, btn, 250);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(btn).toHaveClass(/locked/);

    const overlay = page.locator('[class*="page-overlay"]').first();
    await drag(page, overlay, { x: 0.15, y: 0.15 }, { x: 0.28, y: 0.22 });
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await drag(page, overlay, { x: 0.4, y: 0.15 }, { x: 0.55, y: 0.22 });
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-editor-element]')).toHaveCount(2);
  });

  test('Redact: Blur locks across two drags with a 250ms gap between clicks', async ({ page }) => {
    const toolbar = await openTool(page, '/redact', 'PDF redaction', '.redact-draw-area');
    const btn = toolbar.getByRole('button', { name: 'Blur', exact: true });

    await timedDoubleClick(page, btn, 250);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(btn).toHaveClass(/locked/);

    const overlay = page.locator('.redact-draw-area').first();
    await drag(page, overlay, { x: 0.15, y: 0.15 }, { x: 0.28, y: 0.22 });
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await drag(page, overlay, { x: 0.4, y: 0.15 }, { x: 0.55, y: 0.22 });
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(2);
  });

  // The case that actually broke under real timing: field-nav arrows only
  // mounted once Text/Date armed (pre-SIGN-30), so the FIRST click of a
  // double-click (which arms, unlocked) could shift the toolbar row before
  // the second click - fired at the original screen coordinates, same as any
  // real double-click - landed. A 0ms synthetic double-click never gives that
  // re-render a window to run in; this one does.
  test('Sign: Text on a document with detected fields locks with a 250ms gap between clicks', async ({ page }) => {
    const fs = await import('node:fs');
    const toolbar = await openTool(page, '/sign?next=0', 'PDF annotations', '[class*="page-overlay"]', fs.readFileSync(FIELDS_FIXTURE));
    const btn = toolbar.getByRole('button', { name: 'Text', exact: true });

    // Settle field detection (a dynamic import plus a content-stream walk)
    // before the timed double-click, so the assertion is about the click
    // timing, not a race with detection finishing mid-test.
    await btn.click();
    await expect(page.locator('[class*="field-hint"]').first()).toBeVisible();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');

    await timedDoubleClick(page, btn, 250);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(btn).toHaveClass(/locked/);
  });
});

/**
 * A double-tap on a phone, as a smoke test of the touch path (touch-action on
 * the toolbar, taps reaching the lock). It cannot reproduce the iOS bug:
 * iOS Safari reports every tap as `detail: 1` (measured in the iOS 26
 * simulator), while Chromium's touch emulation counts two quick taps as
 * `detail: 2`, so this passes with or without toolArming.js's tap window.
 * That rule is proven in toolArming.test.js.
 */
test.describe('A double-tap on a phone locks the tool', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // The taps go back to back, with no sleep between them: a fixed 250ms wait
  // plus a loaded CI runner's round trip reached 401ms, past both Chromium's
  // tap-count window and DOUBLE_TAP_MS, and the second tap disarmed instead
  // (1 run in 12 on main; 1 in 30 locally at 6x CPU throttle). The gap between
  // real taps is toolArming.test.js's job, not this smoke test's.
  test('Redact: Blur, two quick taps', async ({ page }) => {
    const toolbar = await openTool(page, '/redact', 'PDF redaction', '.redact-draw-area');
    const btn = toolbar.getByRole('button', { name: 'Blur', exact: true });
    const box = await btn.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(btn).toHaveClass(/locked/);
  });
});

import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * SIGN-30: double-clicking any Sign toolbar tool must lock it armed across
 * repeated placements, with a real mouse. jsdom cannot prove this - it needs
 * a real double-click (native `detail` click counting) and real rendered
 * button positions, which is exactly what a layout shift between the two
 * clicks of a double-click would break.
 */

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Sign tool e2e fixture', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function openSignTool(page) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'sign-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

function toolbar(page) {
  return page.getByRole('toolbar', { name: 'PDF annotations' });
}

function toolButton(page, name) {
  return toolbar(page).getByRole('button', { name, exact: true });
}

function lockSwitch(page) {
  return page.getByRole('switch');
}

async function clickOverlayAt(page, xRatio, yRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
}

// The page overlay is routinely taller than the viewport (a full PDF page at
// real zoom), so a raw `page.mouse` drag - unlike `locator.click()` - is never
// auto-scrolled into view: a ratio point below the fold silently resolves to
// no element at all (a no-op mousedown, not a failure at that point). Both
// ratios here are kept inside the top of the page (see call sites) so the one
// scroll-into-view before the drag starts is enough for its whole path.
async function dragOverlay(page, startRatio, endRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 5 });
  await page.mouse.up();
}

// `[data-editor-signature-item]` only exists in the DOM while the Sign
// dropdown is open (it is the popover's own content), so it can never be used
// to detect whether a signature is already saved - the caller tracks that
// itself, since it is the one creating them.
async function createTypedSignature(page, name, hasExisting) {
  const signBtn = toolButton(page, 'Sign');
  if (!hasExisting) {
    await signBtn.click(); // opens the dialog directly when nothing is saved yet
  } else {
    // Hover, the dropdown's normal desktop trigger (SignToolbar.tsx's
    // openSig/scheduleCloseSig) - deterministic regardless of the popover's
    // current open/closed state, unlike a click on the trigger button, which
    // ALSO toggles the popover (Floating UI's useClick, wired for
    // touch/keyboard) and so can land it open or closed depending on what it
    // was already; `isVisible()` right after a click doesn't wait for that
    // race to settle, so this used to be flaky at the very margin.
    const addButton = page.getByRole('button', { name: /new signature/i });
    await signBtn.hover();
    await expect(addButton).toBeVisible();
    await addButton.click();
  }
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('[data-editor-dialog-tab="type"]').click();
  await page.locator('[data-editor-signature-input]').fill(name);
  await page.locator('[data-editor-signature-save]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

async function expectLocked(page, btn, hasAriaPressed) {
  await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
  if (hasAriaPressed) await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveClass(/locked/);
}

test.describe('Sign toolbar double-click locks every tool (SIGN-30)', () => {
  for (const [name, hasAriaPressed] of [['Text', true], ['Date', true], ['Symbols', true], ['Whiteout', false]]) {
    test(`double-clicking ${name} locks it across two real placements`, async ({ page }) => {
      await openSignTool(page);
      const btn = toolButton(page, name);

      await btn.dblclick();
      await expectLocked(page, btn, hasAriaPressed);

      const isDrag = name === 'Whiteout';
      if (isDrag) {
        await dragOverlay(page, { x: 0.2, y: 0.2 }, { x: 0.32, y: 0.28 });
      } else {
        await clickOverlayAt(page, 0.2, 0.2);
      }
      // A locked tool must still show locked immediately after one placement.
      await expectLocked(page, btn, hasAriaPressed);

      if (isDrag) {
        await dragOverlay(page, { x: 0.5, y: 0.15 }, { x: 0.62, y: 0.23 });
      } else {
        await clickOverlayAt(page, 0.5, 0.5);
      }
      await expectLocked(page, btn, hasAriaPressed);
      await expect(page.locator('[data-editor-element]')).toHaveCount(2);
    });
  }

  test('double-clicking Shapes locks it, and stays locked after picking another shape from its menu', async ({ page }) => {
    await openSignTool(page);
    const shapesBtn = toolButton(page, 'Shapes');

    await shapesBtn.dblclick();
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await dragOverlay(page, { x: 0.15, y: 0.15 }, { x: 0.3, y: 0.22 });
    await expect(page.locator('[data-editor-element]')).toHaveCount(1);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    // Pick a different shape from the menu - this used to drop the lock
    // (SignToolContext's bare SET_TOOL from chooseShape). Hover, the menu's
    // normal desktop trigger (SignToolbar.tsx's openShapes/scheduleCloseShapes):
    // a plain click also toggles the popover (Floating UI's useClick, wired
    // for touch/keyboard), and hovering the button as part of that same click
    // can open and then immediately re-close it.
    const ellipseItem = page.locator('[role="menu"] button', { hasText: /^Ellipse$/ });
    await page.mouse.move(0, 0);
    await shapesBtn.hover();
    await expect(ellipseItem).toBeVisible();
    await ellipseItem.click();
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await dragOverlay(page, { x: 0.5, y: 0.15 }, { x: 0.65, y: 0.25 });
    await expect(page.locator('[data-editor-element]')).toHaveCount(2);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('double-clicking Sign locks it, and stays locked after picking another saved signature from its menu', async ({ page }) => {
    await openSignTool(page);

    // Creating a signature places it once and disarms (one-shot), same as any
    // other creation path - not itself part of the lock assertion.
    await createTypedSignature(page, 'First Signer', false);
    await expect(page.locator('[data-editor-element]')).toHaveCount(1);
    await createTypedSignature(page, 'Second Signer', true);
    await expect(page.locator('[data-editor-element]')).toHaveCount(2);

    const signBtn = toolButton(page, 'Sign');
    await signBtn.dblclick();
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await clickOverlayAt(page, 0.2, 0.65);
    await expect(page.locator('[data-editor-element]')).toHaveCount(3);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    // Pick the other saved signature from the menu - this used to drop the
    // lock (SignToolbar's handleSelectSavedSignature bare SET_TOOL). Hover,
    // same reasoning as createTypedSignature above: deterministic regardless
    // of the popover's current state, unlike a click on the trigger (which
    // also toggles it).
    const sigItem = page.locator('[data-editor-signature-item]').first();
    await page.mouse.move(0, 0);
    await signBtn.hover();
    await expect(sigItem).toBeVisible();
    await sigItem.click();
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await clickOverlayAt(page, 0.6, 0.7);
    await expect(page.locator('[data-editor-element]')).toHaveCount(4);
    await expect(lockSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });
});

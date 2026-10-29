import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';

/**
 * SIGN-30: double-clicking any Sign toolbar tool must lock it armed across
 * repeated placements, with a real mouse. jsdom cannot prove this - it needs
 * a real double-click (native `detail` click counting) and real rendered
 * button positions, which is exactly what a layout shift between the two
 * clicks of a double-click would break.
 */

const makePdfBuffer = () => buildPdf(null, { title: false, lines: [{ text: 'Sign tool e2e fixture' }] });

async function openSignTool(page) {
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
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
});

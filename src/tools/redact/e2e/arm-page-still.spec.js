import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

// RED-70: Box / Brush belongs to Blur and Whiteout. With a mouse it is a submenu
// on hover, so nothing floats over the document while drawing and the page never
// moves. On touch there is no hover, so it hangs under the card while armed.
// SIGN-30's guard measures the toolbar, not the page under it. Rendered geometry:
// jsdom has no layout.

const open = async (page) => openTool(page, '/redact', {
  clearStorage: true,
  file: { name: 'arm-page-still.pdf', buffer: await makePdfBuffer(null, { title: false, lines: [{ text: 'Page stays still' }] }) },
  overlaySelector: '.redact-draw-area',
  toolbarName: 'PDF redaction',
});

const pageTop = async (page) => (await page.locator('.redact-draw-area').first().boundingBox()).y;

test.describe('arming a tool leaves the page still (RED-70)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout guard, Chromium only');

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const name of ['Blur', 'Whiteout']) {
      test(`${name}: the page holds through arm and placement, and the box stays under the pointer`, async ({ page }) => {
        const toolbar = await open(page);
        const idle = await pageTop(page);

        await toolbar.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('[data-brush-controls]')).toHaveCount(0);
        expect(await pageTop(page), 'armed').toBeCloseTo(idle, 0);

        const area = await page.locator('.redact-draw-area').first().boundingBox();
        const x = area.x + 120;
        const y = area.y + 160;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 140, y + 40, { steps: 6 });
        await page.mouse.up();

        expect(await pageTop(page), 'after placement').toBeCloseTo(idle, 0);
        const box = await page.locator('.redact-surface').first().boundingBox();
        expect(Math.abs(box.y - y), 'box top under the press').toBeLessThan(2);
      });
    }

    test('the row can be reached while the done strip is up', async ({ page }) => {
      const toolbar = await open(page);
      await toolbar.getByRole('button', { name: 'Blackout', exact: true }).click();
      const area = await page.locator('.redact-draw-area').first().boundingBox();
      await page.mouse.move(area.x + 120, area.y + 160);
      await page.mouse.down();
      await page.mouse.move(area.x + 260, area.y + 200, { steps: 6 });
      await page.mouse.up();
      await toolbar.getByRole('button', { name: 'Download', exact: true }).click();
      await page.getByRole('button', { name: 'Not now' }).click({ timeout: 8000 }).catch(() => {});
      await expect(page.getByText(/nothing hides under a box/).first()).toBeVisible();

      await toolbar.getByRole('button', { name: 'Blur', exact: true }).hover();
      await page.locator('[data-brush-controls]').getByRole('radio', { name: 'Brush' }).click({ timeout: 2000 });
      await expect(page.locator('[data-brush-controls]').getByRole('radio', { name: 'Brush' })).toBeChecked();
    });

    for (const name of ['Blur', 'Whiteout']) {
      test(`${name}: the submenu opens under its own button on hover and leaves with the pointer`, async ({ page }) => {
        const toolbar = await open(page);
        const controls = page.locator('[data-brush-controls]');
        await expect(controls).toHaveCount(0);

        const button = toolbar.getByRole('button', { name, exact: true });
        await button.hover();
        await expect(controls).toBeVisible();
        const under = await button.boundingBox();
        const menu = await controls.boundingBox();
        expect(menu.y).toBeGreaterThanOrEqual(under.y + under.height);
        expect(Math.abs(menu.x - under.x)).toBeLessThan(8);

        await page.mouse.move(under.x + 40, under.y + 400);
        await expect(controls).toHaveCount(0);
      });
    }

    test('the pointer can cross from the button into the submenu, and a pick arms the tool', async ({ page }) => {
      const toolbar = await open(page);
      const blur = toolbar.getByRole('button', { name: 'Blur', exact: true });
      await blur.hover();
      const brush = page.locator('[data-brush-controls]').getByRole('radio', { name: 'Brush' });
      await brush.hover();
      await brush.click();
      await expect(blur).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-brush-controls]').getByRole('slider')).toBeVisible();
    });

    test('a keyboard reaches the submenu', async ({ page }) => {
      const toolbar = await open(page);
      await toolbar.getByRole('button', { name: 'Blur', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const controls = page.locator('[data-brush-controls]');
      await expect(controls).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect(controls.getByRole('radio', { name: 'Box' })).toBeFocused();
    });
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    for (const name of ['Blur', 'Whiteout']) {
      test(`${name}: the page holds on arm, and the row fits the screen`, async ({ page }) => {
        const toolbar = await open(page);
        const idle = await pageTop(page);
        await toolbar.getByRole('button', { name, exact: true }).tap();
        const controls = page.locator('[data-brush-controls]');
        await expect(controls).toBeVisible();
        expect(await pageTop(page), 'armed').toBeCloseTo(idle, 0);
        await controls.getByRole('radio', { name: 'Brush' }).tap();
        expect(await pageTop(page), 'brush mode').toBeCloseTo(idle, 0);
        const row = await controls.boundingBox();
        expect(row.x).toBeGreaterThanOrEqual(0);
        expect(row.x + row.width).toBeLessThanOrEqual(390);
      });
    }
  });
});

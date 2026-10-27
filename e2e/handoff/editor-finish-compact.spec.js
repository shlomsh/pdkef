import { test, expect } from '@playwright/test';
import { waitForIsland } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/* Shlomi, 2026-10-21, against his design: the finish block under the document
   takes too much of a phone screen. Download and Share are a flat pair, not
   the shell's lifted call-to-action, and the next-tool verbs are small chips
   under it. Both stay 44px touch targets. Sign and Redact share the pair
   (EditorExportActions' completion variant) and the chip row (ExportHandoffs),
   so both are held to it, after a real export. Heights are layout, not text
   width, so they hold on any font. */

const makeFixture = () => makePdfBuffer(null, { size: [400, 500], title: false, lines: [{ text: 'KEEP ME', x: 40, y: 400, size: 20, gray: null }] });

const PAIR_MAX = 52;
const CHIP_MAX = 46;
const TARGET = 44;

for (const tool of [{ name: 'Sign', path: '/sign/?next=0', chip: 'Redact it' }, { name: 'Redact', path: '/redact', chip: 'Sign it' }]) {
  test(`${tool.name}'s finish block is a flat pair over small chips on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
    });
    await page.goto(tool.path);
    await waitForIsland(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    await (await chooser).setFiles({ name: 'finish.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });

    const pageArea = page.locator('[class*="page-wrapper"]').first();
    await expect(pageArea).toBeVisible();
    await page.locator('[role="toolbar"]').first().getByRole('button', { name: 'Whiteout', exact: true }).click();
    const area = await pageArea.boundingBox();
    await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.6, { steps: 6 });
    await page.mouse.up();

    const pair = page.locator('[class*="export-actions"]').last();
    const download = pair.getByRole('button', { name: 'Download' });
    await download.scrollIntoViewIfNeeded();
    await Promise.all([page.waitForEvent('download'), download.click()]);
    const chip = page.getByRole('button', { name: tool.chip, exact: true });
    await expect(chip).toBeVisible();
    await page.mouse.move(0, 0);

    const look = await page.evaluate(({ chipName }) => {
      const pairEl = [...document.querySelectorAll('[class*="export-actions"]')].pop();
      const buttons = [...pairEl.querySelectorAll('button')];
      const chipEl = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === chipName);
      const h = (el) => Math.round(el.getBoundingClientRect().height * 10) / 10;
      return {
        pair: buttons.map(h),
        pairShadow: buttons.map((b) => getComputedStyle(b).boxShadow),
        chip: h(chipEl),
      };
    }, { chipName: tool.chip });

    for (const height of look.pair) {
      expect(height, `pair button ${height}px tall`).toBeGreaterThanOrEqual(TARGET);
      expect(height, `pair button ${height}px tall`).toBeLessThanOrEqual(PAIR_MAX);
    }
    expect(look.pairShadow, 'the pair is flat, not lifted').toEqual(look.pair.map(() => 'none'));
    expect(look.chip, `chip ${look.chip}px tall`).toBeGreaterThanOrEqual(TARGET);
    expect(look.chip, `chip ${look.chip}px tall`).toBeLessThanOrEqual(CHIP_MAX);
  });
}

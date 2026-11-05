import { test, expect } from '@playwright/test';
import { makePdfBuffer } from '../support/pdf.js';
import { waitForIsland } from '../support/tool.js';
import { expectControlsSized } from '../support/layout.js';

// One segmented row serves Scan, Split, PDF to Image and Compress. What it shows under a pointer and how a
// label fits a narrow phone are rendered facts: jsdom has no hover, no pseudo-elements and no layout.
// Compress's own check is level-row-fits.spec.js and Scan's is its tap-target.spec.js, since a spec here would make
// either a dependency of the folder.

async function openWithPdf(page, route) {
  await page.goto(route);
  await waitForIsland(page);
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer('Option row', { pages: 2 }),
  });
  await page.getByRole('radiogroup').first().waitFor();
}

const hairline = (option) => option.evaluate((el) => {
  const style = getComputedStyle(el, '::before');
  return style.content === 'none' ? null : Number(style.opacity);
});
const fill = (option) => option.evaluate((el) => getComputedStyle(el).backgroundColor);
// The fill once the tint's transition has run, so a value read mid-fade is never taken for the hover colour.
const settledFill = (option) => option.evaluate(async (el) => {
  await Promise.all(el.getAnimations().map((animation) => animation.finished));
  return getComputedStyle(el).backgroundColor;
});
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test('unchosen neighbours are divided; the line steps aside for the chosen and the hovered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openWithPdf(page, '/pdf-to-image/');
  const group = page.getByRole('radiogroup', { name: 'Quality' });
  const [first, second, third] = await group.getByRole('radio').all();
  await first.click();
  await page.mouse.move(0, 0);

  await expect.poll(() => hairline(third)).toBe(1);
  await expect.poll(() => hairline(second)).toBe(0);
  await expect.poll(() => fill(third)).toBe(TRANSPARENT);

  await third.hover();
  await expect.poll(() => hairline(third)).toBe(0);
  await expect.poll(() => fill(third)).not.toBe(TRANSPARENT);
});

test('a press tints deeper than a hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openWithPdf(page, '/split/');
  const [, other] = await page.getByRole('radiogroup').first().getByRole('radio').all();
  await other.hover();
  const hovered = await settledFill(other);
  expect(hovered).not.toBe(TRANSPARENT);
  await page.mouse.down();
  await expect.poll(() => settledFill(other)).not.toBe(hovered);
  await page.mouse.up();
});

for (const route of ['/pdf-to-image/', '/he/pdf-to-image/']) {
  test(`no label leaves its option at 320px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openWithPdf(page, route);
    const spills = await page.locator('[role="radio"]:visible').evaluateAll((radios) => radios.flatMap((radio) => {
      const text = document.createRange();
      text.selectNodeContents(radio);
      const label = text.getBoundingClientRect();
      const cell = radio.getBoundingClientRect();
      return label.left < cell.left || label.right > cell.right ? [`${radio.textContent} ${Math.round(label.width)} in ${Math.round(cell.width)}`] : [];
    }));
    expect(spills).toEqual([]);
  });
}

// The cells are 36px inside a 44px track and the look stays that way (ux guidelines §8): a cell takes its taps across
// the whole track, which only a hit test can see. Split's phone shows the compact bar, PDF to Image's shows both forms.
for (const route of ['/split/', '/pdf-to-image/']) {
  test(`every option takes a tap across its 44px track on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openWithPdf(page, route);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 640 });
      await expectControlsSized(page.locator('main'), { selector: '[role="radio"]', minWidth: 44, minHeight: 44, hitArea: true });
    }
  });
}

test('a tap on the gutter chooses the option it belongs to', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openWithPdf(page, '/split/');
  const group = page.getByRole('radiogroup').first();
  const other = group.getByRole('radio').nth(1);
  await expect(other).not.toBeChecked();
  const track = await group.boundingBox();
  const cell = await other.boundingBox();
  await page.mouse.click(cell.x + cell.width / 2, track.y + 1);
  await expect(other).toBeChecked();
});

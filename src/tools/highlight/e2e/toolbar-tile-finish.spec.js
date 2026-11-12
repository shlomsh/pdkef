import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-28: Highlight's tiles take two of the strip's signals: Download outlined (1.5px strong frame, bold word,
   never filled, the Drive arrow inside the same frame) and a quieter hover (soft ground, the quiet frame kept,
   the armed Marker keeps its fill). Computed colours and :hover only exist in a real browser, so jsdom cannot
   pin them. */

const DESKTOP = { width: 1440, height: 1000 };

async function open(page) {
  const buffer = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'finish.pdf', buffer }, overlaySelector: '[data-page-overlay]' });
  const bar = page.locator('[data-editor-toolbar]');
  return {
    bar,
    download: bar.getByRole('button', { name: 'Download', exact: true }),
    replace: bar.getByRole('button', { name: 'Replace file', exact: true }),
    marker: bar.getByRole('button', { name: 'Marker', exact: true }),
  };
}

// Resolves a CSS custom property to the rgb string a computed style reports.
const token = (page, name) => page.evaluate((n) => {
  const probe = document.createElement('div');
  probe.style.background = `var(${n})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour;
}, name);

// The 1.5px frame is a 1px border plus a 0.5px inset ring (Chromium floors a border's width to whole pixels).
async function expectOutlined(page, locator) {
  const strong = await token(page, '--color-border-strong');
  expect(await style(locator, 'borderTopWidth')).toBe('1px');
  expect(await style(locator, 'borderTopColor')).toBe(strong);
  const ring = await style(locator, 'boxShadow');
  expect(ring).toContain(strong);
  expect(ring).toMatch(/0\.5px/);
  expect(ring).toContain('inset');
}

const style = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);

test.describe('desktop', () => {
  test.use({ serviceWorkers: 'block' });

  test('Download is outlined: 1.5px strong frame, bold word, never filled', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const { download } = await open(page);
    await expectOutlined(page, download);
    expect(await style(download, 'fontWeight')).toBe('700');
    expect(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']).toContain(await style(download, 'backgroundColor'));
  });

  test('a hovered tile takes the soft ground and keeps its frame; Download keeps its strong frame', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const { replace, download } = await open(page);
    const soft = await token(page, '--color-primary-soft');
    const border = await token(page, '--color-border');
    const strong = await token(page, '--color-border-strong');
    await replace.hover();
    await expect.poll(() => style(replace, 'backgroundColor')).toBe(soft);
    await expect.poll(() => style(replace, 'borderTopColor')).toBe(border);
    await download.hover();
    await expect.poll(() => style(download, 'backgroundColor')).toBe(soft);
    await expect.poll(() => style(download, 'borderTopColor')).toBe(strong);
  });

  test('the armed Marker keeps its fill under the pointer', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const { marker } = await open(page);
    // A file opens with the Marker armed on desktop, as on touch.
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(5, 5);
    await marker.hover();
    const primary = await token(page, '--color-primary');
    await expect.poll(() => style(marker, 'backgroundColor')).toBe(primary);
  });

  test('with a Drive arrow beside Download, the frame is shared', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const { download } = await open(page);
    await page.evaluate(() => {
      const dl = [...document.querySelectorAll('[data-editor-toolbar] > button')].find((b) => b.textContent.trim() === 'Download' || b.getAttribute('aria-label') === 'Download');
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.setAttribute('data-drive-arrow', '');
      arrow.setAttribute('aria-label', 'Drive');
      // The real arrow's class from DriveSaveMenu.module.css, found in the loaded sheets, so its own
      // `.arrow.arrow.arrow.arrow` rules take part in the cascade, as with a connected Drive.
      const arrowClass = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
        .map((rule) => rule.selectorText?.match(/^\.(_arrow_[\w-]+)\.\1\.\1\.\1$/)?.[1]).find(Boolean);
      if (!arrowClass) throw new Error('DriveSaveMenu arrow class not found in the page sheets');
      arrow.className = arrowClass;
      dl.after(arrow);
    });
    const arrow = page.locator('[data-editor-toolbar] [data-drive-arrow]');
    expect(await style(download, 'borderRightWidth')).toBe('0px');
    await expectOutlined(page, arrow);
    await expectOutlined(page, download);
    // Download's ring stops at the seam: top, bottom and its start side, not all round.
    expect(await style(download, 'boxShadow')).not.toContain('0px 0px 0px 0.5px');
    await arrow.hover();
    await expect.poll(() => style(arrow, 'backgroundColor')).toBe(await token(page, '--color-primary-soft'));
    await expect.poll(() => style(arrow, 'borderTopColor')).toBe(await token(page, '--color-border-strong'));
  });
});

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true, serviceWorkers: 'block' });

  test('Download is outlined at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { download } = await open(page);
    await expectOutlined(page, download);
  });
});

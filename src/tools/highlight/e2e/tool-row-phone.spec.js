import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { expectControlsSized } from '../../../../e2e/support/layout.js';

/* READ-04: Highlight's six controls sit in one row (Full screen is the cord under the card), but Sign's phone rule
   sizes the label font from --controls-per-row, which defaulted to 4 here: labels wrapped badly and "Download"
   clipped on a 402px phone. The row declares its own count so the label stays readable and inside its button. */

test.use({ serviceWorkers: 'block', hasTouch: true, isMobile: true });

for (const size of [{ width: 402, height: 874 }, { width: 375, height: 812 }]) {
  test(`phone tool row at ${size.width}px: readable labels inside their buttons, one row`, async ({ page }) => {
    await page.setViewportSize(size);
    const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text', y: 700 }] });
    await openTool(page, '/highlight-pdf/', { file: { name: 'row.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });

    const rows = await page.evaluate(() => {
      const bar = document.querySelector('[data-editor-toolbar]');
      return [...bar.children]
        .filter((b) => b.getClientRects().length)
        .map((b) => {
          const label = b.querySelector('span:last-child');
          const lh = parseFloat(getComputedStyle(label).lineHeight);
          return {
            text: label.textContent,
            top: Math.round(b.getBoundingClientRect().top),
            label: label.scrollWidth,
            button: b.clientWidth,
            lines: Math.round(label.getBoundingClientRect().height / lh),
            font: parseFloat(getComputedStyle(label).fontSize),
          };
        });
    });
    console.log(size.width, JSON.stringify(rows));
    expect(rows.length).toBe(6);
    for (const r of rows) {
      expect(r.font, `${r.text} font size`).toBeGreaterThanOrEqual(8);
      expect(r.label, `${r.text} fits its button`).toBeLessThanOrEqual(r.button);
      expect(r.lines, `${r.text} line count`).toBeLessThanOrEqual(1);
    }
    expect(new Set(rows.map((r) => r.top)).size).toBe(1);
    const bar = page.locator('[data-editor-toolbar]');
    await expectControlsSized(bar, { selector: ':scope > *', minWidth: 44, minHeight: 44 });
    await expectControlsSized(bar, { selector: 'svg', minWidth: 8, minHeight: 8 });
  });
}

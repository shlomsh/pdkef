import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-04: Highlight's seven controls sit in one row, but Sign's phone rule sizes the label font from
   --controls-per-row, which defaulted to 4 here: "Full screen" wrapped and "Download" clipped on a 402px phone. */

test.use({ serviceWorkers: 'block', viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true });

test('every label in the phone tool row is one line inside its button, and the seven share one row', async ({ page }) => {
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
          fits: label.scrollWidth <= b.clientWidth,
          oneLine: label.getBoundingClientRect().height <= lh * 1.5,
          font: getComputedStyle(label).fontSize,
        };
      });
  });
  expect(rows.length).toBe(7);
  for (const r of rows) {
    expect(r.fits, `${r.text} fits its button`).toBe(true);
    expect(r.oneLine, `${r.text} is one line`).toBe(true);
  }
  expect(new Set(rows.map((r) => r.top)).size).toBe(1);
});

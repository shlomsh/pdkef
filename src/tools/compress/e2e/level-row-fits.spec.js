import { test, expect } from '@playwright/test';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// The four levels share a narrow phone's width; a label wider than its cell only shows in a real layout,
// and this runs on CI's wider Linux font as well as the Mac's.
for (const [route, width] of [['/compress/', 320], ['/compress/', 360], ['/he/compress/', 320]]) {
  test(`no level label leaves its option at ${width}px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto(route);
    await waitForIsland(page);
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer('Level row'),
    });
    await page.getByRole('radiogroup').waitFor();
    const spills = await page.getByRole('radio').evaluateAll((radios) => radios.flatMap((radio) => {
      const text = document.createRange();
      text.selectNodeContents(radio);
      const label = text.getBoundingClientRect();
      const cell = radio.getBoundingClientRect();
      return label.left < cell.left || label.right > cell.right ? [`${radio.textContent} ${Math.round(label.width)} in ${Math.round(cell.width)}`] : [];
    }));
    expect(spills).toEqual([]);
  });
}

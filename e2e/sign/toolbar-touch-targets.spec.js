import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

// 44 CSS px is the touch-target minimum WCAG 2.5.5 (AAA) and Apple's HIG both
// settle on, and the value `--btn-min-size` encodes in SignToolbar.module.css.
const MIN_TARGET = 44;

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Toolbar target-size fixture', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  return Buffer.from(await doc.save());
}

async function openSignTool(page) {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'sign-toolbar-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.locator('[role="toolbar"]')).toBeVisible();
}

// Reads the rendered rect of every top-level toolbar control. Some controls are
// a bare <button>, others are a <div class=dropdown> wrapping the popover
// trigger — the two used to size differently, which is the whole point here.
async function readControlRects(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]');
    return [...toolbar.children]
      .map((child) => (child.tagName === 'BUTTON' ? child : child.querySelector('button')))
      .filter((button) => button && button.offsetParent !== null)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.textContent.trim() || button.title,
          width: rect.width,
          height: rect.height,
        };
      });
  });
}

test.describe('Sign toolbar touch targets', () => {
  // jsdom has no layout, so only a real browser can prove the rendered rects.
  // Two viewports below the 920px icon-only breakpoint: one wide enough for a
  // single row, one narrow enough that the grid has to wrap to a second row.
  for (const width of [700, 390]) {
    test(`keeps every icon-only control at least ${MIN_TARGET}px and all the same size at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSignTool(page);

      const controls = await readControlRects(page);
      expect(controls.length).toBeGreaterThan(5);

      for (const control of controls) {
        expect(
          control.width,
          `"${control.name}" is ${control.width}px wide, below the ${MIN_TARGET}px touch target`,
        ).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(
          control.height,
          `"${control.name}" is ${control.height}px tall, below the ${MIN_TARGET}px touch target`,
        ).toBeGreaterThanOrEqual(MIN_TARGET);
      }

      // Icon-only controls all carry the same content, so any difference in
      // rendered width is a layout bug, not a design choice. The dropdown
      // wrappers used to land ~13px narrower than the buttons beside them.
      const widths = controls.map((control) => control.width);
      const spread = Math.max(...widths) - Math.min(...widths);
      expect(
        spread,
        `Toolbar controls differ in width by ${spread}px: ${controls
          .map((control) => `${control.name}=${control.width}`)
          .join(', ')}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});

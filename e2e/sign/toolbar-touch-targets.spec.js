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

// Reads the rendered rect of every top-level toolbar control, grouped into the
// rows they wrapped onto. Some controls are a bare <button>, others are a
// <div class=dropdown> wrapping the popover trigger — the two used to size
// differently, which is half the point here.
async function readToolbar(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]');
    const toolbarRect = toolbar.getBoundingClientRect();
    const controls = [...toolbar.children]
      .map((child) => (child.tagName === 'BUTTON' ? child : child.querySelector('button')))
      .filter((button) => button && button.offsetParent !== null)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.textContent.trim() || button.title,
          width: rect.width,
          height: rect.height,
          top: Math.round(rect.top),
          left: rect.left,
          right: rect.right,
        };
      });

    const byTop = new Map();
    for (const control of controls) {
      if (!byTop.has(control.top)) byTop.set(control.top, []);
      byTop.get(control.top).push(control);
    }
    const rows = [...byTop.values()].map((row) => ({
      count: row.length,
      leadGap: row[0].left - toolbarRect.left,
      trailGap: toolbarRect.right - row[row.length - 1].right,
    }));

    return { controls, rows };
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

      const { controls, rows } = await readToolbar(page);
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

      // Each wrapped line is centred on its own, so a short final row reads as
      // deliberate instead of stranded against the leading edge. This is the
      // part grid could not do — its rows share one set of columns.
      for (const [index, row] of rows.entries()) {
        expect(
          Math.abs(row.leadGap - row.trailGap),
          `Row ${index + 1} (${row.count} controls) is off-centre: ${row.leadGap}px before, ${row.trailGap}px after`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  // Flex packs greedily left to right, so without the per-line cap in
  // SignToolbar.module.css these widths strand one or two controls on a line of
  // their own (390px used to give 6+3, 500px gave 8+1).
  for (const width of [320, 360, 390, 430, 500]) {
    test(`splits into evenly filled rows at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSignTool(page);

      const { rows } = await readToolbar(page);
      expect(rows.length).toBeGreaterThan(1);

      const counts = rows.map((row) => row.count);
      expect(
        Math.max(...counts) - Math.min(...counts),
        `Rows are unbalanced: ${counts.join('+')}`,
      ).toBeLessThanOrEqual(1);

      // No row may spill past the toolbar it sits in.
      for (const row of rows) {
        expect(row.leadGap).toBeGreaterThanOrEqual(0);
        expect(row.trailGap).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

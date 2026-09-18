import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* SIGN-29 (Shlomi, 2026-09-18): the Download button wrapped onto a full-width
   second row on a normal laptop, because the labelled row outgrew hand-measured
   label-drop thresholds. The toolbar now has two anchors, desktop (1300px and
   up, labels on) and iPhone (the phone grid), with one icon-only line between;
   see SignToolbar.module.css's closing comment. jsdom cannot see rendered rects,
   so this needs a real browser: every visible direct child sharing one `top`
   at a spread of real widths, and Download never ballooning even if a future
   control tips the row over again. Share is stubbed present throughout - the
   wider, real twelve-control case the bug was found in. */

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Toolbar one-line fixture', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function openTool(page, toolPath, fixtureName) {
  await page.goto(toolPath);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: fixtureName, mimeType: 'application/pdf', buffer: await makePdfBuffer() });
  await expect(page.locator('[role="toolbar"]')).toBeVisible();
}

// navigator.canShare/.share do not exist in Playwright's default Chromium
// profile, so PdfSignTool/PdfRedactTool's usePdfShare() reads canSharePdf as
// false without this - stubbed before any script on the page runs, so the
// tool's own mount-time probe (usePdfShare.js) sees it too.
async function stubSharePresent(page) {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
}

async function readToolbarLine(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]');
    const toolbarWidth = toolbar.getBoundingClientRect().width;
    const children = [...toolbar.children].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const tops = children.map((el) => Math.round(el.getBoundingClientRect().top));
    const downloadEl = children.find((el) => /download/i.test(el.className));
    return {
      childCount: children.length,
      tops,
      downloadWidth: downloadEl ? downloadEl.getBoundingClientRect().width : null,
      toolbarWidth,
    };
  });
}

// From where eleven 44px icons first fit one line (~532px box, ~660px
// viewport; narrower is the phone grid, covered by toolbar-phone-row.spec.js),
// the 920px floor, the laptop band the bug lived in, both
// sides of the 1300px label breakpoint, and the plateau beyond it.
const WIDTHS = [700, 768, 920, 1000, 1100, 1200, 1299, 1300, 1440, 1600];

// Generous: Download is a real button among eleven or twelve others, never
// the whole row. 40% is well above its labelled width at every measured
// case (worst measured was ~19% of the toolbar at 920px) and well below the
// ~100% a wrapped, stranded control reached before this fix.
const MAX_DOWNLOAD_SHARE = 0.4;

const tools = [
  { name: 'Sign', path: '/sign', fixture: 'sign-desktop-one-line.pdf' },
  { name: 'Redact', path: '/redact', fixture: 'redact-desktop-one-line.pdf' },
];

for (const tool of tools) {
  test(`${tool.name} toolbar stays one line with Share present, 700px and up`, async ({ page }) => {
    await stubSharePresent(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTool(page, tool.path, tool.fixture);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      const { childCount, tops, downloadWidth, toolbarWidth } = await readToolbarLine(page);
      expect(childCount, `${tool.name} at ${width}px: expected several visible controls`).toBeGreaterThan(5);
      expect(
        tops.every((top) => top === tops[0]),
        `${tool.name} toolbar wrapped at ${width}px: control tops are ${JSON.stringify(tops)}`,
      ).toBe(true);
      expect(
        downloadWidth / toolbarWidth,
        `${tool.name} Download is ${downloadWidth}px of a ${toolbarWidth}px toolbar at ${width}px - looks like a stranded, full-width button`,
      ).toBeLessThan(MAX_DOWNLOAD_SHARE);
    }
  });
}

// jsdom cannot see which labels are clipped to the 1x1 visually-hidden box,
// so the two anchors are checked on real rendered label widths: at 1440px
// (the plateau) every label shows except Undo and Feedback, which are
// icon-only at every width (`data-icon-only`); at 1200px everything is
// icon-only. And the row reads in the order a form gets done: Text first,
// Sign after the filling vocabulary (Text, Date, Symbols, Shapes, Whiteout).
async function labelWidth(page, text) {
  return page.evaluate((label) => {
    const spans = [...document.querySelectorAll('[role="toolbar"] .label, [role="toolbar"] span')];
    const span = spans.find((el) => el.textContent?.trim() === label);
    return span ? span.getBoundingClientRect().width : null;
  }, text);
}

test('Text leads and Sign follows the filling tools, labels show at the desktop anchor except Undo and Feedback, and none show below 1300px', async ({ page }) => {
  await stubSharePresent(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTool(page, '/sign', 'sign-desktop-one-line-order.pdf');
  await page.setViewportSize({ width: 1440, height: 1000 });

  const leadingLabels = await page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]');
    return [...toolbar.children].slice(0, 6).map((el) => el.querySelector('.label, span')?.textContent?.trim());
  });
  expect(leadingLabels, 'the filling tools lead and Sign follows them').toEqual(['Text', 'Date', 'Symbols', 'Shapes', 'Whiteout', 'Sign']);

  for (const label of ['Sign', 'Text', 'Date', 'Symbols', 'Whiteout', 'Replace', 'Share', 'Download']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} label should exist`).not.toBeNull();
    expect(width, `${label} should be labelled at 1440px`).toBeGreaterThan(5);
  }
  for (const label of ['Undo', 'Feedback']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} label should exist for screen readers`).not.toBeNull();
    expect(width, `${label} is icon-only at every width`).toBeLessThanOrEqual(2);
  }

  await page.setViewportSize({ width: 1200, height: 1000 });
  for (const label of ['Sign', 'Whiteout', 'Replace', 'Download']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} is icon-only below 1300px`).toBeLessThanOrEqual(2);
  }
});

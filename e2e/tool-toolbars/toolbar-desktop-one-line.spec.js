import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* SIGN-29 (Shlomi, 2026-09-18): the Download button wrapped onto a full-width
   second row on a normal laptop. Cause: the toolbar's fully-labelled row
   (twelve controls once Share is present) outgrew the label-drop thresholds
   in SignToolbar.module.css's >=920px block, so between roughly 1160px and
   the card's own ~1172px content-box ceiling the row overflowed, wrapped,
   and `.toolbar > * { flex: 1 1 auto }` grew the stranded Download to fill
   the line alone. jsdom cannot see rendered rects or a real container query
   resolving against the toolbar's own box, so this needs a real browser:
   every visible direct child sharing one `top` at a spread of real desktop
   widths, and Download never ballooning even if a future control tips the
   row over again. Share is stubbed present throughout - the wider, real
   twelve-control case the bug was found in - since a false-negative here
   (only ever testing the easier ten/eleven-control case) is worse than a
   slower spec. */

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

// The 920px floor itself, plus enough real laptop-class widths to cover the
// band the bug lived in (roughly 1160-1300px) and the plateau beyond it
// where the toolbar's own box stops growing (see SignToolbar.module.css's
// >=920px comment, measured ceiling ~1172px content box).
const WIDTHS = [920, 1000, 1100, 1200, 1300, 1440, 1600];

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
  test(`${tool.name} toolbar stays one line with Share present, 920px and up`, async ({ page }) => {
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

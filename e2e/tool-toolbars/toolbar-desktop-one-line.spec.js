import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../support/pdf.js';
import { openTool as openSharedTool } from '../support/tool.js';

/* SIGN-29 (Shlomi, 2026-09-18): the Download button wrapped onto a full-width
   second row on a normal laptop, because the labelled row outgrew hand-measured
   label-drop thresholds. The toolbar now has two anchors, desktop (1300px and
   up, labels on) and iPhone (the phone grid), with one icon-only line between;
   see SignToolbar.module.css's closing comment. jsdom cannot see rendered rects,
   so this needs a real browser: every visible direct child sharing one vertical centre (within 1px)
   at a spread of real widths, and Download never ballooning even if a future
   control tips the row over again. Share is stubbed present throughout - the
   wider, real case the bug was found in (twelve controls then; thirteen
   rendered today, of which twelve are counted for the wrap arithmetic).

   Re-measured 2026-09-20 in headless Chromium on Linux (the wide DejaVu face,
   Share stubbed present) after the History control and the change-history
   dialog came out: Sign's labelled row (before SIGN-49's ghost row) was 1139.7px against a 1172px content
   box, 32.3px spare, and Date is labelled again. SignToolbar.module.css's
   closing comment carries the rest of those numbers. */

const makePdfBuffer = () => buildPdf(null, { title: false, lines: [{ text: 'Toolbar one-line fixture' }] });

const openTool = async (page, toolPath, fixtureName) => {
  await openSharedTool(page, toolPath, { file: { name: fixtureName, buffer: await makePdfBuffer() }, expectToolbar: true });
};

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
    // Controls differ in height by design (40, 42 and 44px) and are centred in
    // the line, so one line is judged on each control's vertical centre.
    const centres = children.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const downloadEl = children.find((el) => /download/i.test(el.className));
    return {
      childCount: children.length,
      centres,
      downloadWidth: downloadEl ? downloadEl.getBoundingClientRect().width : null,
      toolbarWidth,
    };
  });
}

// From where both tools' icon rows fit one line, up through the 920px floor,
// the laptop band the bug lived in, both sides of the 1300px label
// breakpoint, and the plateau beyond it. The floor is arithmetic, not taste:
// N * 44px + (N-1) * 4.8px of gap inside the toolbar's content box, which is
// the viewport less 112.8px of page gutters and toolbar padding from 768px
// (62.8px below it, where the loaded card has no frame since 2026-10-28).
// Redact's nine need 434.4px and hold down to 544px (measured after History
// came out on 2026-09-20); its floor is still 700px. Sign's floor is 648px:
// SIGN-49's ghost row (twelve controls with Share, Share split 6+6 below) holds
// one line with Share present down to a 644px window and wraps 6+6 at 643px
// (stepped down from 1000px in 1px steps, macOS Chromium, 2026-11-12), plus a
// 4px margin.
// Below its own floor a toolbar is the wrapped grid, whose balance is
// toolbar-touch-targets.spec.js's and sign-toolbar-labels-fit.spec.js's job.
const WIDTHS = [768, 920, 1000, 1100, 1200, 1299, 1300, 1440, 1600];

// Generous: Download is a real button among eight to twelve others, never
// the whole row. 40% is well above its labelled width at every measured case
// (worst measured 2026-09-20 was 149.4px of a 1196px toolbar, 12.5%, Redact
// labelled at 1440px) and well below the ~100% a wrapped, stranded control
// reached before this fix.
const MAX_DOWNLOAD_SHARE = 0.4;

const tools = [
  { name: 'Sign', path: '/sign/?next=0', fixture: 'sign-desktop-one-line.pdf', floor: 648 },
  { name: 'Redact', path: '/redact', fixture: 'redact-desktop-one-line.pdf', floor: 700 },
];

for (const tool of tools) {
  test(`${tool.name} toolbar stays one line with Share present, ${tool.floor}px and up`, async ({ page }) => {
    await stubSharePresent(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTool(page, tool.path, tool.fixture);

    for (const width of [tool.floor, ...WIDTHS.filter((w) => w > tool.floor)]) {
      await page.setViewportSize({ width, height: 1000 });
      const { childCount, centres, downloadWidth, toolbarWidth } = await readToolbarLine(page);
      expect(childCount, `${tool.name} at ${width}px: expected several visible controls`).toBeGreaterThan(5);
      expect(
        Math.max(...centres) - Math.min(...centres) <= 1,
        `${tool.name} toolbar wrapped at ${width}px: control centres are ${JSON.stringify(centres)}`,
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
// (the plateau) every label shows except Undo, Redo and Feedback, which are
// icon-only at every width (`data-icon-only`); at 1200px everything is
// icon-only. And the row reads in the order a form gets done: Text first,
// Sign after the filling vocabulary (Text, Date, Mark, Shapes, Whiteout).
async function labelWidth(page, text) {
  return page.evaluate((label) => {
    const spans = [...document.querySelectorAll('[role="toolbar"] .label, [role="toolbar"] span')];
    const span = spans.find((el) => el.textContent?.trim() === label);
    return span ? span.getBoundingClientRect().width : null;
  }, text);
}

test('Text leads and Sign follows the filling tools, labels show from a 1280px window except icon-only Undo and Redo, and none show at 1100px', async ({ page }) => {
  await stubSharePresent(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTool(page, '/sign/?next=0', 'sign-desktop-one-line-order.pdf');
  await page.setViewportSize({ width: 1440, height: 1000 });

  const leadingLabels = await page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]');
    // The word a person sees: More stacks its swap words in one cell and hides all but one.
    const shown = (label) => [...label.querySelectorAll('[aria-hidden="true"]')].reduce((text, hidden) => text.replace(hidden.textContent, ''), label.textContent).trim();
    return [...toolbar.children].slice(0, 6).map((el) => { const label = el.querySelector('.label, span'); return label ? shown(label) : undefined; });
  });
  expect(leadingLabels, 'the filling tools lead and Sign follows them').toEqual(['Text', 'Date', 'Mark', 'Whiteout', 'Sign', 'More']);

  for (const label of ['Sign', 'Text', 'Date', 'Mark', 'Whiteout', 'Full screen', 'Replace', 'More', 'Share', 'Download']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} label should exist`).not.toBeNull();
    expect(width, `${label} should be labelled at 1440px`).toBeGreaterThan(5);
  }
  // Undo and Redo stay icon-only at every width - an arrow is a convention,
  // and neither is a tool. Since SIGN-49 Replace is labelled with the rest.
  for (const label of ['Undo', 'Redo']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} label should exist for screen readers`).not.toBeNull();
    expect(width, `${label} is icon-only at every width`).toBeLessThanOrEqual(2);
  }

  // SIGN-49: Sign's labels follow the toolbar's own width (>= 1160px), so they
  // show at a 1280px window and are icon-only at 1100px.
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (const label of ['Sign', 'Whiteout', 'Replace', 'Download']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} is labelled at 1280px`).toBeGreaterThan(5);
  }
  await page.setViewportSize({ width: 1100, height: 1000 });
  for (const label of ['Sign', 'Whiteout', 'Replace', 'Download']) {
    const width = await labelWidth(page, label);
    expect(width, `${label} is icon-only at 1100px`).toBeLessThanOrEqual(2);
  }
});

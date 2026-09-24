import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* MERGE-11 / Direction A hand-off row (2026-09-13): PdfShareButton only
   renders once `navigator.share`/`canShare` exist, so a real device without
   the Web Share API never gets a dead Share button - it is simply absent,
   and the hand-off row is Compress / Sign only. This guard supplies
   the API (the same `addInitScript` pattern merge-layout.spec.js uses) so
   the row's shape - Share first, then Compress, then Sign, all on one
   line even at phone width - can be asserted at all.

   Run against the production build with `npx playwright test
   src/tools/merge/e2e/merge-share.spec.js` once a build exists; a scratch script
   verified this same guard against the 4399 dev server (see the epic's
   report for the measured numbers) since the preview on 4173 serves
   whatever was last built, which does not yet include this change. */

// Phone width regardless of which project's own default viewport runs this
// (chromium's project default is a 1600px desktop size) - the one-line
// requirement is specifically about the phone hand-off row.
test.use({ viewport: { width: 375, height: 812 } });

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

async function loadReadyRowWithShare(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });

  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['first.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  await expect(page.locator('[data-state="ready"]')).toBeVisible({ timeout: 10_000 });

  const handoffButtons = page.locator('[class*="handoff-row"] > button, [class*="handoff-row"] > a');
  await expect(handoffButtons).toHaveCount(3);
  return handoffButtons;
}

async function expectEveryLabelToFit(handoffButtons) {
  const overflows = await handoffButtons.evaluateAll((nodes) => nodes.map((node) => ({
    label: node.textContent.trim(),
    overflow: node.scrollWidth - node.clientWidth,
  })));
  for (const { label, overflow } of overflows) {
    expect(overflow, label).toBeLessThanOrEqual(0);
  }
}

test('the hand-off row leads with Share, and all three buttons sit on one line', async ({ page }) => {
  const handoffButtons = await loadReadyRowWithShare(page);

  const first = handoffButtons.nth(0);
  await expect(first).toBeVisible();
  await expect(first).toContainText('Share');

  const boxes = await handoffButtons.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { y: rect.y, height: rect.height };
  }));
  expect(boxes).toHaveLength(3);
  const firstY = boxes[0].y;
  for (const box of boxes) {
    expect(Math.abs(box.y - firstY)).toBeLessThanOrEqual(2);
  }

  // Every hand-off button carries an icon before its label (Share keeps its
  // own glyph; Compress and Sign use their launcher icons).
  const svgCounts = await handoffButtons.evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll('svg').length));
  for (const count of svgCounts) {
    expect(count).toBeGreaterThanOrEqual(1);
  }

  // At the row's own size: the labels fit a 375px phone without shrinking.
  await expectEveryLabelToFit(handoffButtons);
});

// The desktop rail is a fixed 320px, so with Share present each button is
// about 93px wide. "Compress it" once overflowed its own border there and a
// desktop-only font shrink papered over it; the labels are short enough now
// to fit at the row's normal size, and this keeps them that way.
test.describe('on the desktop rail', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('every hand-off label fits inside its own button', async ({ page }) => {
    await expectEveryLabelToFit(await loadReadyRowWithShare(page));
  });
});

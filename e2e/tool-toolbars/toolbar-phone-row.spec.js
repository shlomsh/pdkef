import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* The editor card on a phone (Shlomi, 2026-09-17: "the app toolbar is taking
   too much space in mobile"). It is sticky, so its height comes straight off
   the document at every scroll position. Two things jsdom cannot prove:

   - the card is one context row plus the button grid, not thumbnail + two-line
     identity + hint band + grid (~250px at 390px wide before this);
   - arming a tool does not move the toolbar. The filename and the status line
     share one grid cell (ToolShell.module.css, phone block), and the status
     keeps a hidden reservation per tool (EditorToolStatus), so the row is the
     same height in every state. The second click of a double-click has to
     land on the button the first one did (editor.md, "Repeat placement"),
     and a sticky bar that changes height is a layout shift the CLS score
     charges us for. */

const PHONE = { width: 390, height: 844 };

// Generous: the row (~36px), the grid (two 44px lines and their gaps) and the
// card's own padding. Before the phone row landed the same card measured ~250.
const MAX_CARD_HEIGHT = 170;

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Phone toolbar row fixture', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
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

const rect = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), height: Math.round(r.height) };
});

const tools = [
  { name: 'Sign', path: '/sign?next=0', fixture: 'sign-phone-row.pdf', arm: 'Text' },
  { name: 'Redact', path: '/redact', fixture: 'redact-phone-row.pdf', arm: 'Blackout' },
];

for (const tool of tools) {
  test.describe(`${tool.name} editor card on a phone`, () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

    test('is one row over the grid, and arming a tool leaves the grid where it was', async ({ page }) => {
      await openTool(page, tool.path, tool.fixture);
      const card = page.locator('[data-tool-shell]');
      const toolbar = page.locator('[role="toolbar"]');
      const name = card.locator('[class*="name"]').first();

      // Idle: the filename is the row, and there is no thumbnail beside it
      // (FilePreview's box is ToolShell.module.css's `.icon`, hashed to
      // `_icon_…`; the status line's `help-icon` glyph does not match that).
      await expect(name).toBeVisible();
      expect(await card.locator('[class*="_icon_"], img').count()).toBe(0);
      const idleCard = await rect(card);
      const idleToolbar = await rect(toolbar);
      expect(idleCard.height, `card is ${idleCard.height}px tall`).toBeLessThanOrEqual(MAX_CARD_HEIGHT);

      // Armed: the sentence and the keep-on switch take the same row, and
      // nothing under it moves. The switch reads its short label here.
      await page.getByRole('button', { name: tool.arm, exact: true }).click();
      const toggle = page.getByRole('switch');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAccessibleName(/^Keep on$/);
      await expect(name).toBeHidden();
      expect(await rect(toolbar)).toEqual(idleToolbar);
      expect(await rect(card)).toEqual(idleCard);

      // The switch sits beside the sentence, not under it: same row.
      const sentence = page.locator('[role="status"] [class*="help-text"]');
      const [sentenceBox, toggleBox] = await Promise.all([sentence.boundingBox(), toggle.boundingBox()]);
      expect(toggleBox.y).toBeLessThan(sentenceBox.y + sentenceBox.height);
      expect(toggleBox.x).toBeGreaterThanOrEqual(sentenceBox.x + sentenceBox.width - 1);
    });
  });
}

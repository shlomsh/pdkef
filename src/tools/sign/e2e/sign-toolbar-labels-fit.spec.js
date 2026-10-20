import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

// Sign's phone toolbar: a word under every control, Download kept beside Share,
// and no row ever stranding a lone control. Labels use the system font stack,
// so nothing here asserts a pixel width of text (tests.md): a label is visible
// when it has a rendered box, and fits when a Range over its text sits inside
// its button's border box on both sides. Every offender is collected by name
// before any assertion fails.

async function makeFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Sign toolbar labels fixture', { x: 30, y: 320, size: 14, font });
  return Buffer.from(await doc.save());
}

async function openSign(page, path) {
  // Share only exists where the browser can share; the toolbar's Download is
  // swapped for it below 920px.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });
  await page.goto(path);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText(/^(Choose file|בחירת קובץ)$/).first().click();
  await (await chooser).setFiles({ name: 'sign-toolbar-fit.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[role="toolbar"]').first()).toBeVisible();
}

// Rendered direct children of the toolbar row, with the first button inside
// each (the child itself when it is a button), measured in the page.
function measureToolbar() {
  const bar = document.querySelector('[role="toolbar"]');
  const out = [];
  for (const child of bar.children) {
    const cs = getComputedStyle(child);
    const box = child.getBoundingClientRect();
    if (cs.display === 'none' || box.width === 0 || box.height === 0) continue;
    const button = child.matches('button') ? child : child.querySelector('button');
    const labelEl = button && (button.querySelector('[class*="label"]'));
    let label = null;
    if (labelEl) {
      const lb = labelEl.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(labelEl);
      const text = range.getBoundingClientRect();
      const bb = button.getBoundingClientRect();
      label = { w: lb.width, h: lb.height, left: text.left - bb.left, right: bb.right - text.right };
    }
    out.push({
      name: (button && (button.getAttribute('aria-label') || button.textContent.trim() || button.title)) || child.getAttribute('role') || `${child.tagName.toLowerCase()}.${child.className}`,
      role: child.getAttribute('role'),
      top: Math.round(box.top), width: box.width, height: box.height, label,
    });
  }
  return out;
}

const rowCounts = (controls) => {
  const rows = {};
  for (const c of controls) rows[c.top] = (rows[c.top] || 0) + 1;
  return Object.keys(rows).map(Number).sort((a, b) => a - b).map((k) => rows[k]);
};

const WIDTHS = [360, 375, 390, 402, 414, 430];
const CASES = [
  ...WIDTHS.map((width) => ({ width, path: '/sign/?next=0', share: 'Share', download: 'Download' })),
  { width: 390, path: '/he/sign/?next=0', share: 'שיתוף', download: 'הורדה' },
];

for (const { width, path, share, download } of CASES) {
  test.describe(`${path} at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

    test('every control shows a word that fits, Download stays beside Share, rows balance', async ({ page }) => {
      await openSign(page, path);
      const controls = await page.evaluate(measureToolbar);
      expect(controls.length, 'the toolbar rendered its controls').toBeGreaterThanOrEqual(10);

      const noWord = [];
      const overhang = [];
      for (const c of controls) {
        if (!c.label || c.label.w <= 2 || c.label.h <= 2) {
          noWord.push(`${c.name} (button ${c.width.toFixed(1)}px, label ${c.label ? `${c.label.w.toFixed(1)}x${c.label.h.toFixed(1)}` : 'none'})`);
        } else if (c.label.left < -0.5 || c.label.right < -0.5) {
          overhang.push(`${c.name} (button ${c.width.toFixed(1)}px, overhang ${Math.max(-c.label.left, -c.label.right).toFixed(1)}px)`);
        }
      }
      const names = controls.map((c) => c.name);
      const missing = [share, download].filter((n) => !names.includes(n));
      const split = rowCounts(controls);
      console.log(`${path} WIDTH ${width}: rows ${split.join('+')}, narrowest ${Math.min(...controls.map((c) => c.width)).toFixed(1)}px`);

      const balanced = split.every((n) => n >= 2) && Math.max(...split) - Math.min(...split) <= 1;
      expect.soft(noWord, `controls with no visible word at ${width}px`).toEqual([]);
      expect.soft(overhang, `labels that overflow their button at ${width}px`).toEqual([]);
      expect.soft(missing, `Share and Download both rendered at ${width}px`).toEqual([]);
      expect.soft(balanced, `rows balanced (>=2 each, differ by <=1), got ${split.join('+')}`).toBe(true);
      if (width === 390) expect.soft(split.length, `two rows at 390px, got ${split.join('+')}`).toBe(2);
    });
  });
}

test.describe('Sign row, 919px down to 239px', () => {
  test.use({ viewport: { width: 919, height: 844 }, hasTouch: true, isMobile: true });

  test("with Share, Sign's row never strands a lone control from 919px to 239px", async ({ page }) => {
    test.setTimeout(120_000);
    await openSign(page, '/sign/?next=0');
    const failures = [];
    for (let width = 919; width >= 239; width--) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      const controls = await page.evaluate(measureToolbar);
      const split = rowCounts(controls);
      const names = controls.map((c) => c.name);
      const problems = [];
      if (split.some((n) => n < 2)) problems.push('lone control in a row');
      if (Math.max(...split) - Math.min(...split) > 1) problems.push('rows differ by more than 1');
      if (!names.includes('Share')) problems.push('no Share');
      if (!names.includes('Download')) problems.push('no Download');
      const narrow = controls.filter((c) => c.width < 43.5).map((c) => `${c.name} ${c.width.toFixed(1)}px`);
      if (narrow.length) problems.push(`narrower than 43.5px: ${narrow.join(', ')}`);
      if (problems.length) failures.push(`${width}px [${split.join('+')}] ${problems.join('; ')}`);
    }
    expect(failures, 'widths where the row strands, unbalances or drops a control').toEqual([]);
  });
});

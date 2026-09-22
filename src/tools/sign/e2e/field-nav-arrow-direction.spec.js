import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Which way the element bar's field arrows point, measured in a real engine.
 *
 * The rule (MOBI-06, "it just should be visually logic"): whichever way the
 * document reads, the picture is `<` on the left and `>` on the right. For an
 * RTL document only the binding swaps - the left arrow moves forward, because
 * forward in a right-to-left form is leftward. Two flips produce that: `dir`
 * on the button group reverses the row, and a CSS rule mirrors each glyph.
 *
 * The same bug has now shipped twice, once per copy of the control, and both
 * times it was one of the two flips going missing. The top card's copy mirrored
 * off the UI locale instead of the document (MOBI-06); the element bar's copy
 * reversed the row but never mirrored the glyphs, so a Hebrew form in the
 * English edition drew `>` `<`, two arrows pointing at each other (reported
 * 2026-09-22). jsdom applies no CSS, so the unit tests could only ever pin the
 * `dir` attribute - never the picture. This reads the picture.
 *
 * Both runs are in the ENGLISH edition on purpose: the locale must not enter
 * into it, and a Hebrew document under an English UI is exactly the case where
 * a rule keyed on the wrong direction comes out backwards.
 *
 * MOBI-15 asked for this spec. It is here now.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const DOCUMENTS = [
  {
    name: 'a right-to-left form (income tax form 101)',
    file: path.join(root, 'src', 'editor', 'adapters', 'pdf', 'corpus', 'scoring', 'forms', 'income-tax-101-2024.pdf'),
    direction: 'rtl',
    forwardOnThe: 'left',
  },
  {
    name: 'a left-to-right form (the practice form)',
    file: path.join(root, 'public', 'images', 'redaction-guide', 'sample.pdf'),
    direction: 'ltr',
    forwardOnThe: 'right',
  },
];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/**
 * For each field arrow in the element bar: where it sits, what it does, and
 * which way it is actually drawn. The raw glyphs are fixed - Previous is
 * drawn `<` and Next `>` - and a mirrored glyph points the other way, so the
 * rendered direction is the raw one XOR the computed transform's x-scale sign.
 */
async function readArrows(page) {
  return page.locator('[data-editor-actions]').first().evaluate((bar) => {
    const buttons = [...bar.querySelectorAll('button')].filter((b) => /field/i.test(b.getAttribute('aria-label') || ''));
    return buttons.map((button) => {
      const label = button.getAttribute('aria-label');
      const isNext = /next/i.test(label);
      const svg = button.querySelector('svg');
      const transform = svg ? getComputedStyle(svg).transform : 'none';
      // matrix(a, b, c, d, e, f): a < 0 means the glyph is flipped horizontally.
      const a = transform.startsWith('matrix(') ? parseFloat(transform.slice(7)) : 1;
      const mirrored = a < 0;
      const rawPointsLeft = !isNext;
      return {
        label,
        isNext,
        x: button.getBoundingClientRect().left,
        pointsLeft: rawPointsLeft !== mirrored,
        groupDir: button.closest('[dir]')?.getAttribute('dir') ?? null,
      };
    });
  });
}

for (const doc of DOCUMENTS) {
  test(`the arrows read left-to-right as < > on ${doc.name}`, async ({ page }) => {
    await page.goto('/sign/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    await (await chooser).setFiles({ name: 'form.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(doc.file) });
    await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();

    await page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true }).click();
    const field = page.locator('[class*="field-hint-cell"]').first();
    await expect(field).toBeVisible();
    await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-editor-actions]').first().getByRole('button', { name: 'Next field' })).toBeVisible();

    const arrows = await readArrows(page);
    expect(arrows, 'both arrows are in the element bar').toHaveLength(2);

    // Non-vacuity: this document really does resolve to the direction under test.
    expect(arrows[0].groupDir, 'the document direction reached the button group').toBe(doc.direction);

    const [left, right] = [...arrows].sort((a, b) => a.x - b.x);
    // The picture, whatever the document: `<` on the left, `>` on the right.
    expect(left.pointsLeft, `left arrow (${left.label}) is drawn <`).toBe(true);
    expect(right.pointsLeft, `right arrow (${right.label}) is drawn >`).toBe(false);
    // The binding: forward sits on the side a reader of this document moves towards.
    const forward = doc.forwardOnThe === 'left' ? left : right;
    expect(forward.isNext, `forward (Next) is on the ${doc.forwardOnThe} for ${doc.direction}`).toBe(true);
  });
}

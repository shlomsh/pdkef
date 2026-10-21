import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

/* Shlomi, 2026-10-21: Edit Pages' sticky bottom sheet took 259px of a 402px
   phone after Apply (the dimmed Apply, a tall Download with the size inside,
   Share, stacked). The Sign/Redact finish pattern instead: one compact flat
   row pinned (Apply, then Download | Share as equal halves), and the next-tool
   chips in the page flow under it, never inside the pinned sheet. Visits
   /sign/, so it lives here and not under the tool's own e2e folder. */

async function makeFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i += 1) doc.addPage([300, 400]).drawText(`Page ${i}`, { x: 40, y: 340, size: 28, font });
  return Buffer.from(await doc.save());
}

// One 44px row, its 8px padding and the safe-area/border slack; the old sheet was 259px.
const SHEET_MAX = 90;
const TARGET = 44;
const BUTTON_MAX = 52;

test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });

test('Edit Pages pins one compact row and hands off from below it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });
  await page.goto('/edit-pdf/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).first().click();
  await (await chooser).setFiles({ name: 'six.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });

  const sheet = page.locator('[data-edit-sheet]');
  await page.getByRole('button', { name: 'Rotate page 1 right' }).click();
  const apply = sheet.getByRole('button', { name: /Apply/i });
  await expect(apply).toBeEnabled();
  const before = await sheet.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(before, `sheet before Apply is ${before}px`).toBeLessThanOrEqual(SHEET_MAX);

  await apply.click();
  const download = sheet.getByRole('link', { name: /Download/i }).or(sheet.getByRole('button', { name: /Download/i })).first();
  const share = sheet.getByRole('button', { name: /Share/i });
  await expect(download).toBeVisible();
  await expect(share).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Apply/i })).toHaveCount(0);
  await page.mouse.move(0, 0);

  const look = await page.evaluate(() => {
    const el = document.querySelector('[data-edit-sheet]');
    const controls = [...el.querySelectorAll('a, button')].filter((c) => c.getBoundingClientRect().width > 0);
    const box = (c) => c.getBoundingClientRect();
    return {
      sheet: Math.round(box(el).height),
      controls: controls.map((c) => ({ text: c.textContent.trim(), width: box(c).width, height: box(c).height, top: Math.round(box(c).top), shadow: getComputedStyle(c).boxShadow })),
    };
  });
  expect(look.sheet, `sheet after Apply is ${look.sheet}px`).toBeLessThanOrEqual(SHEET_MAX);
  expect(look.controls.length, 'Download and Share, nothing else pinned').toBe(2);
  const [a, b] = look.controls;
  expect(a.top, 'Download and Share share one row').toBe(b.top);
  expect(Math.abs(a.width - b.width), `equal halves: ${a.width} vs ${b.width}`).toBeLessThanOrEqual(1);
  for (const c of look.controls) {
    expect(c.height, `${c.text} is ${c.height}px tall`).toBeGreaterThanOrEqual(TARGET);
    expect(c.height, `${c.text} is ${c.height}px tall`).toBeLessThanOrEqual(BUTTON_MAX);
    expect(c.shadow, `${c.text} is flat`).toBe('none');
  }

  const signIt = page.getByRole('button', { name: 'Sign it', exact: true });
  await expect(page.getByRole('button', { name: 'Compress it', exact: true })).toBeVisible();
  await expect(signIt).toBeVisible();
  expect(await signIt.evaluate((el) => el.closest('[data-edit-sheet]') === null), 'the chips are not pinned').toBe(true);

  await signIt.click();
  await expect(page).toHaveURL(/\/sign\/$/);
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  await expect(page.getByText(/_modified/).first()).toBeVisible();
});

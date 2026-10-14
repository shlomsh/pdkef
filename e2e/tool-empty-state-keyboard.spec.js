import { test, expect } from '@playwright/test';

// QUAL-22: the empty state's "Choose files" control must be in the tab order.
// It was a <label> around <input type="file" hidden>; `hidden` is display:none,
// so Tab skipped it and the :has(input:focus-visible) ring could never match.
// jsdom has no tab order or computed focusability, so this needs a real browser.
//
// One route per BasePdfTool caller: /merge/ is the "band" variant, /compress/
// and /compress-image/ the `compact` one, /sign/ has the iOS hint opt-in.
const toolRoutes = [
  '/merge/',
  '/split/',
  '/compress/',
  '/compress-image/',
  '/pdf-to-image/',
  '/image-to-pdf/',
  '/unlock/',
  '/sign/?next=0',
  '/redact/',
  '/edit-pdf/',
];

const PICKER = '[data-empty-state] label:has(input[type="file"])';
const PDF = { name: 'keyboard.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') };

async function open(page, route) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await page.goto(route);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator(PICKER), route).toBeVisible();
}

// Tab from the top of the page until focus lands on the picker's input.
async function tabToPicker(page) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const onInput = await page.evaluate(() => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement && a.type === 'file' && !!a.closest('[data-empty-state]');
    });
    if (onInput) return i + 1;
  }
  return -1;
}

const ringOf = (page) => page.locator(PICKER).evaluate((el) => getComputedStyle(el).boxShadow);
// box-shadow transitions over 0.18s, so a read right after the keypress sees the start value.
const RING = '0px 0px 0px 4px';
const expectRing = (page, label) => expect.poll(() => ringOf(page), { message: label }).toContain(RING);

for (const route of toolRoutes) {
  test(`Tab reaches Choose files and Enter or Space opens the picker on ${route}`, async ({ page }) => {
    await open(page, route);

    expect(await tabToPicker(page), `${route}: Tab never reached the file input`).toBeGreaterThan(0);

    // The ring is `--shadow-focus` (0 0 0 4px primary); the resting shadow is a soft drop.
    await expectRing(page, `${route}: keyboard focus shows the ring`);

    for (const key of ['Enter', 'Space']) {
      const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
      await page.keyboard.press(key);
      await (await chooser).setFiles([]);
      // Re-focus: the picker may have taken focus away in some engines.
      await page.locator(`${PICKER} input`).focus();
    }
  });
}

test('the focus ring shows for keyboard focus only, not after a mouse click', async ({ page }) => {
  await open(page, '/unlock/');
  const resting = await ringOf(page);
  expect(resting).not.toContain(RING);

  const chooser = page.waitForEvent('filechooser');
  await page.locator(PICKER).click();
  await (await chooser).setFiles([]);
  await page.mouse.move(0, 0);
  // Settle past the transition before asserting absence, or it passes vacuously.
  await page.waitForTimeout(400);
  expect(await ringOf(page), 'a mouse click leaves no ring').not.toContain(RING);
});

test('a file chosen through the keyboard-focused input still reaches the tool', async ({ page }) => {
  await open(page, '/unlock/');
  expect(await tabToPicker(page)).toBeGreaterThan(0);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(PDF);
  await expect(page.locator('[data-empty-state]')).toHaveCount(0);
});

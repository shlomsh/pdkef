import { test, expect } from '@playwright/test';

// SITE-44: the tool crumb in the app bar ("PDkef > Scan to PDF") is the only thing in the bar that
// gives, so on a phone it used to be cut to a letter or two with no ellipsis ("S" at 320px) and the
// badge pressed against it. The rule now is that it either shows enough of its name to read, ending
// in an ellipsis when cut, or is not there at all. Only a real browser has the line boxes and the
// flex row this depends on, so jsdom cannot say anything about it.
//
// Assertions are layout properties, never a text pixel width: the system font draws the same label
// at a different width on macOS, CI's Linux and Android (tests.md), and the room itself moves a few
// pixels with the wordmark's width.
test.use({ serviceWorkers: 'block' });

// The three longest tool names ("Add Page Numbers to PDF", "Protect & Unlock PDF", "Blur & Redact PDF")
// and the one that started it ("Scan to PDF").
const TOOLS = ['/add-page-numbers-to-pdf/', '/unlock/', '/redact/', '/scan-to-pdf/'];
// The phones the ticket names, plus the 721-765px band where the chips regain their labels.
const SQUEEZED = [320, 360, 375, 390, 744, 768];
const MIN_READABLE_NAME = 64; // 4rem: "Scan to…" and up

async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    };
    const bar = document.querySelector('[data-has-chips]');
    const crumb = bar.querySelector('[data-crumb]');
    const name = crumb.lastElementChild;
    const shown = getComputedStyle(crumb).display !== 'none';
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shown,
      nameWidth: shown ? name.clientWidth : 0,
      cut: shown && name.scrollWidth > name.clientWidth,
      textOverflow: getComputedStyle(name).textOverflow,
      brand: box(bar.querySelector('a')),
      crumb: shown ? box(crumb) : null,
      badge: box(bar.querySelector('[data-on-device]')),
      chips: box(bar.querySelector('.trust-chips')),
    };
  });
}

for (const route of TOOLS) {
  test(`${route}: the crumb reads or gives way at every squeezed width`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(route);
    await page.waitForSelector('.trust-chips-end', { state: 'attached' });

    for (const width of SQUEEZED) {
      await page.setViewportSize({ width, height: 700 });
      const m = await measure(page);
      const at = `${route} at ${width}px`;

      expect(m.overflow, `${at}: the page scrolls sideways`).toBeLessThanOrEqual(0);

      if (m.shown) {
        expect(m.nameWidth, `${at}: the crumb shows ${m.nameWidth}px of its name`).toBeGreaterThanOrEqual(MIN_READABLE_NAME);
        if (m.cut) expect(m.textOverflow, `${at}: a cut name has no ellipsis`).toBe('ellipsis');
      }

      // Left to right: brand, crumb (if shown), badge, chips, each clear of the one before.
      const row = [m.brand, m.crumb, m.badge, m.chips].filter(Boolean);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].left - row[i - 1].right, `${at}: item ${i} touches the one before it`).toBeGreaterThanOrEqual(4);
      }
    }
  });
}

// The other half of the rule: giving way must not become the default. Where the bar has room, every
// name shows whole.
test('with room to spare the crumb shows every tool name whole', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  for (const route of TOOLS) {
    await page.goto(route);
    await page.waitForSelector('.trust-chips-end', { state: 'attached' });
    const m = await measure(page);
    expect(m.shown, `${route}: the crumb is missing at 1280px`).toBe(true);
    expect(m.cut, `${route}: the name is cut at 1280px`).toBe(false);
  }
});

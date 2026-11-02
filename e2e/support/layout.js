// One layout assertion for the e2e specs: every control under a container has a real, usable box.
// A flex cell squeezed to 24 px or an svg drawn 0 px wide leaves every unit test green, because jsdom lays nothing out.
import { expect } from '@playwright/test';

const DEFAULT_SELECTOR = 'button, [role="radio"], [role="menuitemradio"], [role="menuitem"], svg';

/**
 * Asserts that every visible element matching `selector` under the container `locator` points to
 * is rendered at least `minWidth` x `minHeight` CSS px. One evaluation in the page; one failure
 * message lists every offender (tag, accessible name or class, size). Matching nothing fails too,
 * since a selector that hits no element would otherwise pass for ever.
 * Visible: non-zero client rects (so no `display: none` ancestor) and not `visibility: hidden`.
 *
 * @param {import('@playwright/test').Locator} locator  The container (must resolve to one element).
 * @param {object} [options]
 * @param {number} [options.minWidth=0]
 * @param {number} [options.minHeight=0]
 * @param {string} [options.selector]  Defaults to buttons, radios, menu items and svgs.
 */
export async function expectControlsSized(locator, { minWidth = 0, minHeight = 0, selector = DEFAULT_SELECTOR } = {}) {
  const { checked, offenders } = await locator.evaluate((root, { minWidth, minHeight, selector }) => {
    const found = [];
    for (const el of root.querySelectorAll(selector)) {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width >= minWidth && rect.height >= minHeight) { found.push(null); continue; }
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 30)
        || String(el.getAttribute('class') || '').trim() || '(unnamed)';
      found.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`);
    }
    return { checked: found.length, offenders: found.filter(Boolean) };
  }, { minWidth, minHeight, selector });
  expect(checked, `no visible element matches ${selector}`).toBeGreaterThan(0);
  expect(offenders, `controls under ${minWidth}x${minHeight}: ${offenders.join('; ')}`).toEqual([]);
}

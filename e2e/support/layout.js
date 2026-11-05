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
 * With `hitArea`, the size is what a hit test finds on the lines through the element's centre, not its
 * box: an `::after` that extends a target counts, and whatever is laid over the target does not.
 *
 * @param {import('@playwright/test').Locator} locator  The container (must resolve to one element).
 * @param {object} [options]
 * @param {number} [options.minWidth=0]
 * @param {number} [options.minHeight=0]
 * @param {string} [options.selector]  Defaults to buttons, radios, menu items and svgs.
 * @param {boolean} [options.hitArea=false]  Measure where a tap lands instead of the element's box.
 */
export async function expectControlsSized(locator, { minWidth = 0, minHeight = 0, selector = DEFAULT_SELECTOR, hitArea = false } = {}) {
  const { checked, offenders } = await locator.evaluate((root, { minWidth, minHeight, selector, hitArea }) => {
    // Walked in half pixels, so a target on a fractional offset can read half a pixel short: rounded up.
    const hitSize = (el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const walk = (dx, dy) => {
        let distance = 0;
        while (distance < 200 && el.contains(document.elementFromPoint(x + dx * (distance + 0.5), y + dy * (distance + 0.5)))) distance += 0.5;
        return distance;
      };
      return { width: Math.ceil(walk(-1, 0) + walk(1, 0)), height: Math.ceil(walk(0, -1) + walk(0, 1)) };
    };
    const found = [];
    for (const el of root.querySelectorAll(selector)) {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      const rect = hitArea ? hitSize(el) : el.getBoundingClientRect();
      if (rect.width >= minWidth && rect.height >= minHeight) { found.push(null); continue; }
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 30)
        || String(el.getAttribute('class') || '').trim() || '(unnamed)';
      found.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`);
    }
    return { checked: found.length, offenders: found.filter(Boolean) };
  }, { minWidth, minHeight, selector, hitArea });
  expect(checked, `no visible element matches ${selector}`).toBeGreaterThan(0);
  expect(offenders, `controls under ${minWidth}x${minHeight}: ${offenders.join('; ')}`).toEqual([]);
}

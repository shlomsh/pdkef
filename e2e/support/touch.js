// One touch-tap helper for the e2e specs. Raw `page.touchscreen.tap` is held at zero by scripts/check-raw-tap-ratchet.mjs.
import { expect } from '@playwright/test';

// Why: on Linux CI a tap can be counted as the second click of a double click and open nothing, so a tap that waits for a result is repeated until `done()` holds.
export async function tapUntil(page, { x, y }, done, { intervals = [600], timeout } = {}) {
  await page.touchscreen.tap(x, y);
  let first = true;
  await expect.poll(async () => {
    if (await done()) return true;
    // The first check follows the tap just made; only later checks tap again.
    if (!first) await page.touchscreen.tap(x, y);
    first = false;
    return false;
  }, { intervals, timeout }).toBe(true);
}

// Why: a tap where a repeat would undo the first (toggles, arming, deliberate double taps) must stay a single tap, and this keeps it a named choice.
export async function tapOnce(page, { x, y }) {
  await page.touchscreen.tap(x, y);
}

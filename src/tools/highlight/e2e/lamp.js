import { expect } from '@playwright/test';

/** Pulls the Reading lamp's cord and waits for the lamp to be up. The cord is still dropping in when the tool opens. A
 * press on it then can scroll the page in WebKit, which tucks the cord, and the press only pops it back (QUAL-51).
 * `tapUntil` is no answer here: the cord is a toggle, so a retry could undo the first pull. The page then rises to its
 * place in the lamp for a second, so a box measured before its animation ends names a spot it has left (QUAL-59). */
export async function pullCord(page, press = 'click') {
  await page.locator('[data-lamp-part="cord"]:not([data-intro])').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Full screen' }).first()[press]();
  await expect(page.locator('[data-lamp]')).toBeAttached();
  await page.locator('[data-lamp-part="board"]').evaluate((board) => Promise.allSettled(board.getAnimations().map((a) => a.finished)));
}

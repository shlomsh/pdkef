/** Pulls the Reading lamp's cord. The cord is still dropping in when the tool opens. A press on it then can scroll
 * the page in WebKit, which tucks the cord, and the press only pops it back (QUAL-51). `tapUntil` is no answer here:
 * the cord is a toggle, so a retry could undo the first pull. */
export async function pullCord(page, press = 'click') {
  await page.locator('[data-lamp-part="cord"]:not([data-intro])').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Full screen' }).first()[press]();
}

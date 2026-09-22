import { test, expect } from '@playwright/test';

// The one place the back/forward cache is exercised. Everything else in this
// suite comes back to the home page with a fresh `page.goto('/')`, which
// re-parses the document and so cannot see this class of bug at all: the
// launcher froze on the way out with its busy flag set, and a Back brought
// that flag back with it, leaving every recent tile, the picker and the drop
// target disabled and the picker reading "Opening..." for good (reported
// 2026-09-22 on iOS). See `.claude/rules/tools-and-shell.md` and
// `src/lib/useNavigatingAway.ts`.
//
// Three settings make it reproducible, and it reproduces with none of them
// missing. Each one on its own turns this spec green against the bug, so keep
// all three together or delete the file:
//
// - `channel: 'chromium'`. A headless `chromium` runs Playwright's
//   chrome-headless-shell, which has no back/forward cache at all, so the
//   restore never happens and every assertion below passes for the wrong
//   reason. The channel is the full browser in new headless mode. CI's
//   `playwright install chromium` fetches both builds, so this needs no extra
//   install step.
// - `ignoreDefaultArgs`. Playwright launches Chromium with
//   `--disable-back-forward-cache` among its default switches, and an
//   `--enable-features=BackForwardCache` arg does not override it. A first
//   attempt at this guard was abandoned as "Chromium cannot restore from the
//   bfcache", on a measurement that had only proved that switch was still on.
// - `serviceWorkers: 'block'`. One run in several had the worker take control
//   mid-load and evict the restored page, the same reason
//   `recent-tile-restores-work.spec.js` blocks them.
//
// Measured with all three: green 5 runs out of 5 on the fix, red 5 out of 5
// with the hook's listener removed. The engine in the report is WebKit, and
// this suite's `webkit` project is an allowlist (`playwright.config.js`) that
// this file is deliberately not on: WebKit's own page cache under Playwright
// has not been measured here, and an unverified guard on a second engine is
// not a guard.
test.use({
  serviceWorkers: 'block',
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

const RECENTS_KEY = 'pdf-toolkit:workspace:recent-files';

test('a Back to the launcher can still open the next document', async ({ page }) => {
  // Index rows alone: these tiles only have to render and navigate, so no
  // entry bytes are seeded and no tool has to restore anything.
  await page.addInitScript(([key, rows]) => {
    localStorage.setItem(key, JSON.stringify(rows));
  }, [RECENTS_KEY, [
    { id: 'sha256:entry-a', tool: 'sign', fileName: 'entry-a.pdf', savedAt: Date.now() - 60_000 },
    { id: 'sha256:entry-b', tool: 'sign', fileName: 'entry-b.pdf', savedAt: Date.now() },
  ]]);
  await page.goto('/');

  // Survives a restore and nothing else, so it separates "the fix works" from
  // "this run never restored the page" - the way this guard silently stopped
  // guarding once already.
  await page.evaluate(() => { window.__restoreProbe = 'launcher'; });
  await page.getByRole('button', { name: /Open recent PDF, entry-a\.pdf/ }).click();
  await page.waitForURL('**/sign/');

  // `load` does not fire again on a restore, so the default wait never settles.
  await page.goBack({ waitUntil: 'commit' });
  expect(await page.evaluate(() => window.__restoreProbe)).toBe('launcher');

  const picker = page.locator('[data-home-picker]').first();
  await expect(picker).not.toContainText('Opening');
  await page.getByRole('button', { name: /Open recent PDF, entry-b\.pdf/ }).click();
  await page.waitForURL('**/sign/');
  expect(await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:sign')))
    .toBe('sha256:entry-b');
});

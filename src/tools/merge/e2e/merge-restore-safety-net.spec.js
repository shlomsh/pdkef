import { test, expect } from '@playwright/test';

// html[data-merge-restore] hides the tool column until the restored grid mounts. If that never happens
// (the island never runs, a chunk fails, the restore stalls) nothing removes the attribute, so
// ToolStage.astro's CSS must bring the page back on its own, as it does for a hand-off
// (e2e/handoff-pending-safety-net.spec.js). Seen on an iPhone on 2026-10-28: the condensed h1 over an
// empty page. jsdom has no animation clock.

test.use({ serviceWorkers: 'block' });

test('a Merge restore marker with the island blocked still reveals the page within 7s', async ({ page }) => {
  await page.route(/\/(?:_astro|site|shared)\/[^/]+\.js$/, (route) => route.abort());
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-toolkit:workspace:current:merge', 'stuck');
      localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([{ id: 'stuck' }]));
    } catch { /* private mode */ }
  });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/merge/');
  const main = page.locator('.tool-stage main').first();
  const airplane = page.locator('[data-airplane-note]').first();
  await expect(page.locator('html')).toHaveAttribute('data-merge-restore', '1');
  expect(await main.evaluate((el) => getComputedStyle(el).visibility), 'hidden at first').toBe('hidden');
  await expect.poll(() => main.evaluate((el) => getComputedStyle(el).visibility), { timeout: 7000 }).toBe('visible');
  expect(await airplane.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
});

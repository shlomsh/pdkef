import { test, expect } from '@playwright/test';

// HERO-02 safety net: html[data-handoff-pending] hides the tool column until the island releases it.
// If the island never runs (an uncached chunk offline, a script error) nothing removes the attribute,
// so ToolPageLayout.astro's CSS must bring the page back on its own. jsdom has no animation clock.

test.use({ serviceWorkers: 'block' });

test('a pending marker with the island blocked still reveals the page within 7s', async ({ page }) => {
  await page.route(/\/(?:_astro|site|shared)\/[^/]+\.js$/, (route) => route.abort());
  await page.addInitScript(() => {
    try { sessionStorage.setItem('pdkef:handoff-pending:compress', '1'); } catch { /* private mode */ }
  });
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto('/compress/');
  const main = page.locator('.tool-stage main').first();
  await expect(page.locator('html')).toHaveAttribute('data-handoff-pending', '1');
  expect(await main.evaluate((el) => getComputedStyle(el).visibility), 'hidden at first').toBe('hidden');
  await expect.poll(() => main.evaluate((el) => getComputedStyle(el).visibility), { timeout: 7000 }).toBe('visible');
});

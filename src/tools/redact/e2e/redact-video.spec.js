import { test, expect } from '@playwright/test';

// SEO-59: the video plays in place. Nothing reaches the player's host before a press, and
// the frame passes this page's CSP after one, which astro dev cannot show.
test('the Redact video reaches its host only on press, and its frame passes the CSP', async ({ page }) => {
  const playerRequests = [];
  await page.route('https://www.youtube-nocookie.com/**', (route) => {
    playerRequests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<title>player</title>' });
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(e.blockedURI));
  });

  await page.goto('/redact/');
  const video = page.locator('[data-tool-video]');
  await video.scrollIntoViewIfNeeded();
  await expect(video.locator('img')).toBeVisible();
  await expect.poll(() => video.locator('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  expect(playerRequests).toEqual([]);
  // The button lies over the whole poster, so any background of its own hides the picture.
  await expect(video.getByRole('button', { name: /^Play/ })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await video.getByRole('button', { name: /^Play/ }).click();
  await expect(video.locator('iframe')).toBeVisible();
  await expect.poll(() => playerRequests.length).toBe(1);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

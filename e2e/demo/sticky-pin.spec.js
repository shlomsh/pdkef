import { test, expect } from '@playwright/test';
import { stageLocator, scrollStory } from './heroDemoHelpers.js';
test.use({ serviceWorkers: 'block' });
test('both complete stories share one full-viewport pinned space', async ({ page }) => {
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/');
  const stage = stageLocator(page, 'sign');
  await expect.poll(() => stage.evaluate(el => el.style.getPropertyValue('--p-track'))).not.toBe('');
  await scrollStory(page, 'sign', 0.25);
  const baseline = await stage.boundingBox();
  for (const key of ['sign', 'blur']) {
    for (const fraction of [0.25, 0.5, 1]) {
      await scrollStory(page, key, fraction);
      const box = await stageLocator(page, key).boundingBox();
      expect(Math.abs(box.y - baseline.y)).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThanOrEqual(721);
    }
    await expect.poll(() => stageLocator(page,key).evaluate(el => Number(el.style.getPropertyValue('--p-sent')))).toBe(1);
    // [data-hero-sent] rather than a CSS-module class substring: the two
    // stories reach "sent" through different elements - the sign story marks
    // its outgoing chat bubble, the bill story lands a separate confirmation
    // row - and they no longer share a class. Renaming either one's styling
    // used to silently stop this from finding anything.
    await expect.poll(() => stageLocator(page,key).locator('[data-hero-sent]').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.85);
  }
  expect(await page.locator('.home-dock a').count()).toBe(9);
});

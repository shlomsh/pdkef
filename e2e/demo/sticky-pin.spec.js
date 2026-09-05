import { test, expect } from '@playwright/test';
import { stageLocator, scrollStory } from './heroDemoHelpers.js';
test.use({ serviceWorkers: 'block' });
test('both complete stories share one pinned space above the dock', async ({ page }) => {
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/');
  const stage = stageLocator(page, 'sign');
  await expect.poll(() => stage.evaluate(el => el.style.getPropertyValue('--p-track'))).not.toBe('');
  const baseline = await stage.boundingBox();
  const dock = await page.locator('.home-dock').boundingBox();
  for (const key of ['sign', 'blur']) {
    for (const fraction of [0.25, 0.5, 1]) {
      await scrollStory(page, key, fraction);
      const box = await stageLocator(page, key).boundingBox();
      expect(Math.abs(box.y - baseline.y)).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThanOrEqual(dock.y + 1);
    }
    await expect.poll(() => stageLocator(page,key).evaluate(el => Number(el.style.getPropertyValue('--p-sent')))).toBe(1);
    await expect.poll(() => stageLocator(page,key).locator('[class*="anim-sent_"]').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.85);
  }
  expect(await page.locator('.home-dock a').count()).toBe(9);
});

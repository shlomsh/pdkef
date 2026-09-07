import { test, expect } from '@playwright/test';
import { scrollStory, stageLocator } from './heroDemoHelpers.js';

test.use({ serviceWorkers: 'block' });

test('the blur story holds its inbox, cleaned reply, and sent confirmation', async ({ page }) => {
  await page.goto('/');

  const stage = stageLocator(page, 'blur');
  await expect.poll(() => stage.evaluate(el => el.style.getPropertyValue('--p-track'))).not.toBe('');

  const arriving = stage.locator('[class*="email-arriving_"]');
  const reply = stage.locator('[class*="reply-layer_"]');
  const sent = stage.locator('[data-hero-sent]');

  // The existing inbox remains readable for a dedicated beat before mail
  // begins to arrive.
  await scrollStory(page, 'blur', 0.04);
  await expect(arriving).toHaveCSS('opacity', '0');

  // Opening is a separate beat from the press, so the request remains on
  // screen long enough for its ripple to read as a deliberate tap.
  await scrollStory(page, 'blur', 0.15);
  await expect.poll(() => stage.evaluate(el => Number(el.style.getPropertyValue('--p-tap')))).toBeGreaterThan(0.5);
  await expect.poll(() => stage.evaluate(el => Number(el.style.getPropertyValue('--p-open')))).toBe(0);

  // The reply has completed its entrance but send has not started, leaving
  // the cleaned attachment and its Send control visible to inspect.
  await scrollStory(page, 'blur', 0.75);
  await expect(reply).toHaveCSS('opacity', '1');
  await expect.poll(() => stage.evaluate(el => Number(el.style.getPropertyValue('--p-sent')))).toBe(0);

  // The confirmation remains on screen at the end of the pass. Autoplay
  // restarts the story from here, rather than fading the whole demo away and
  // leaving a visitor with a blank panel.
  await scrollStory(page, 'blur', 0.9);
  await expect(sent).toHaveCSS('opacity', '1');
  await expect(stage).toHaveCSS('opacity', '1');
  await scrollStory(page, 'blur', 0.98);
  await expect(stage).toHaveCSS('opacity', '1');
});

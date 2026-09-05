import { test, expect } from '@playwright/test';
import { stageLocator, scrollStory } from './heroDemoHelpers.js';

// The incoming chat is the story's handoff: it needs to remain readable
// after the message animation completes, before the attachment opens into
// the signing UI. This checks the rendered scroll positions rather than the
// private beat map, so a timing refactor cannot accidentally remove the hold.
test.use({ serviceWorkers: 'block' });

test('the completed permission-slip attachment holds before the PDF opens', async ({ page }) => {
  await page.goto('/');

  const stage = stageLocator(page, 'sign');
  await expect(stage).toBeVisible();

  // Wait for ScrollDriver to replace the no-JS completed-state default with
  // its live scroll position before sampling the track.
  await expect.poll(() => stage.evaluate((el) => el.style.getPropertyValue('--p-track'))).not.toBe('');

  const chat = stage.locator('[class*="chat-layer_"]');
  const form = stage.locator('[class*="form-layer_"]');

  // The message has already appeared by 10% progress. The PDF is still
  // closed for the added reading hold, which begins its crossfade just after
  // 13% progress.
  await scrollStory(page, 'sign', 0.1);
  await expect(chat).toHaveCSS('opacity', '1');
  await expect(form).toHaveCSS('opacity', '0');

  // Once the hold has passed, the form is the sole visible story layer.
  await scrollStory(page, 'sign', 0.21);
  await expect(chat).toHaveCSS('opacity', '0');
  await expect(form).toHaveCSS('opacity', '1');
});

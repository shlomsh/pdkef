import { test, expect } from '@playwright/test';
import { stageLocator } from './heroDemoHelpers.js';

// The incoming chat is the story's handoff: it needs to remain readable
// after the message animation completes, before the attachment opens into
// the signing UI. This checks the rendered scroll positions rather than the
// private beat map, so a timing refactor cannot accidentally remove the hold.
test.use({ serviceWorkers: 'block' });

test('the completed permission-slip attachment holds before the PDF opens', async ({ page }) => {
  await page.goto('/');

  const track = page.locator('[data-hero-track="sign"]');
  const stage = stageLocator(page, 'sign');
  await expect(stage).toBeVisible();

  // Wait for ScrollDriver to replace the no-JS completed-state default with
  // its live scroll position before sampling the track.
  await expect.poll(() => stage.evaluate((el) => el.style.getPropertyValue('--p-track'))).not.toBe('');

  const trackBox = await track.boundingBox();
  const stageBox = await stage.boundingBox();
  expect(trackBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  const pinRange = trackBox.height - stageBox.height;

  const chat = stage.locator('[class*="chat-layer_"]');
  const form = stage.locator('[class*="form-layer_"]');

  // The message has already appeared by 10% progress. The PDF is still
  // closed for the added reading hold, which begins its crossfade just after
  // 13% progress.
  await page.evaluate(({ top, range }) => window.scrollTo(0, top + range * 0.1), {
    top: trackBox.y,
    range: pinRange,
  });
  await expect(chat).toHaveCSS('opacity', '1');
  await expect(form).toHaveCSS('opacity', '0');

  // Once the hold has passed, the form is the sole visible story layer.
  await page.evaluate(({ top, range }) => window.scrollTo(0, top + range * 0.21), {
    top: trackBox.y,
    range: pinRange,
  });
  await expect(chat).toHaveCSS('opacity', '0');
  await expect(form).toHaveCSS('opacity', '1');
});

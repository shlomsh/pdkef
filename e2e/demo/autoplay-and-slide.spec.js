import { test, expect } from '@playwright/test';
import { scrollStory, stageLocator } from './heroDemoHelpers.js';

test.use({ serviceWorkers: 'block' });

test('the visible demo plays without scrolling, scroll scrubs it, and story two arrives as a panel', async ({ page }) => {
  await page.goto('/');

  const signStage = stageLocator(page, 'sign');
  await expect.poll(() => signStage.evaluate(el => el.style.getPropertyValue('--p-track'))).not.toBe('');

  const { scrollY, progress } = await signStage.evaluate(el => ({
    scrollY: window.scrollY,
    progress: Number(el.style.getPropertyValue('--p-track')),
  }));
  await page.waitForTimeout(700);
  const laterProgress = await signStage.evaluate(el => Number(el.style.getPropertyValue('--p-track')));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(laterProgress).toBeGreaterThan(progress + 0.005);

  // At the handoff, the old complete panel is pushed left while the next
  // complete panel enters from the right. This deliberately rules out the
  // former same-place fade between two unrelated demos.
  // Exercise the two track endpoints directly. The following live scrub
  // check verifies ScrollDriver's timeline; splitting that concern from this
  // geometry guard avoids sampling a coalesced programmatic scroll mid-frame.
  await page.evaluate(() => {
    document.querySelector('[data-hero-track="sign"]')?.style.setProperty('--story-slide', '-100%');
    document.querySelector('[data-hero-track="blur"]')?.style.setProperty('--story-slide', '100%');
  });
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('[data-home-demo]')?.getBoundingClientRect();
    const sign = document.querySelector('[data-hero-track="sign"]')?.getBoundingClientRect();
    const blur = document.querySelector('[data-hero-track="blur"]')?.getBoundingClientRect();
    if (!root || !sign || !blur) return null;
    return { rootLeft: root.left, width: root.width, signLeft: sign.left, blurLeft: blur.left };
  })).not.toBeNull();
  const handoff = await page.evaluate(() => {
    const root = document.querySelector('[data-home-demo]')?.getBoundingClientRect();
    const sign = document.querySelector('[data-hero-track="sign"]')?.getBoundingClientRect();
    const blur = document.querySelector('[data-hero-track="blur"]')?.getBoundingClientRect();
    if (!root || !sign || !blur) throw new Error('demo tracks are missing');
    return { rootLeft: root.left, width: root.width, signLeft: sign.left, blurLeft: blur.left };
  });
  expect(handoff.signLeft).toBeLessThan(handoff.rootLeft - handoff.width * 0.45);
  expect(handoff.blurLeft).toBeGreaterThan(handoff.rootLeft + handoff.width * 0.45);

  // Page scrolling jumps to a precise moment and temporarily owns the clock.
  await scrollStory(page, 'blur', 0.15);
  await expect.poll(() => stageLocator(page, 'blur').evaluate(el => Number(el.style.getPropertyValue('--p-track')))).toBeCloseTo(0.15, 2);
});

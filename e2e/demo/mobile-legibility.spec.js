import { test, expect } from '@playwright/test';
import { TRACKS, demoSection, stageLocator } from './heroDemoHelpers.js';

// 390px is explicitly the width DEMO-02 designs for ("the width that
// matters" - CLAUDE.md). jsdom has no layout engine at all, so it cannot
// measure real text overflow, real wrapping, or whether a fixed-aspect-
// ratio phone mockup (`.phone`'s `aspect-ratio: 9 / 19` in
// HeroDemo.module.css) still fits a 390px viewport once its own chrome
// (bezel, padding) is accounted for.
test.use({ serviceWorkers: 'block' });

test('the demo is legible and overflow-free at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const demo = demoSection(page);
  await expect(demo, 'HeroDemo section never rendered').toBeVisible();

  // The demo itself must never be the reason the page scrolls horizontally
  // at this width (CLAUDE.md's "Responsive" rule: the body must never
  // scroll horizontally) - the single most common way a fixed px value or
  // an un-shrinkable row breaks a narrow viewport. Scoped to the demo's own
  // box rather than `document.documentElement.scrollWidth`: this page also
  // carries an unrelated, pre-existing app-wide tooltip element (outside
  // this component, in index.astro, out of this suite's ownership) that
  // already contributes a few px of document-level scrollWidth on its own,
  // and a demo-specific guard should not fail on that unrelated cause.
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const demoBox = await demo.boundingBox();
  expect(demoBox, 'demo section has no real box at 390px').not.toBeNull();
  expect(demoBox.x, 'demo section starts off the left edge at 390px').toBeGreaterThanOrEqual(-1);
  expect(
    demoBox.x + demoBox.width,
    `demo section (right edge ${Math.round(demoBox.x + demoBox.width)}) overflows the ${clientWidth}px viewport`
  ).toBeLessThanOrEqual(clientWidth + 1);

  // Hero title, privacy line and both story captions are the demo's only
  // real prose - assert none is horizontally clipped by its own container
  // (scrollWidth > clientWidth is the standard DOM signal that an
  // element's content is wider than its box).
  const proseSelectors = ['[class*="hero-title_"]', '[class*="privacy-line_"]', '[class*="caption_"]'];
  for (const selector of proseSelectors) {
    const nodes = demo.locator(selector);
    const count = await nodes.count();
    expect(count, `no element matched ${selector} inside the demo - selector may be stale`).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const node = nodes.nth(i);
      const box = await node.boundingBox();
      expect(box, `${selector} #${i} has no real box at 390px`).not.toBeNull();
      expect(box.height, `${selector} #${i} is vacuously sized at 390px`).toBeGreaterThan(0);
      const overflowing = await node.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      const text = ((await node.textContent()) || '').trim();
      expect(overflowing, `"${text.slice(0, 60)}" (${selector}) is clipped horizontally at 390px`).toBe(false);
    }
  }

  // Both phone mockups must fit entirely within the actual available
  // width at 390px - no horizontal scroll needed to see the rest of the
  // phone, and no negative offset hiding its left edge.
  for (const track of TRACKS) {
    const stage = stageLocator(page, track);
    const phone = stage.locator('[class*="_phone_"]').first();
    const box = await phone.boundingBox();
    expect(box, `${track}'s phone mockup never rendered at 390px`).not.toBeNull();
    expect(box.width, `${track}'s phone mockup is vacuously sized`).toBeGreaterThan(50);
    expect(box.x, `${track}'s phone mockup starts off the left edge at 390px`).toBeGreaterThanOrEqual(-1);
    expect(
      box.x + box.width,
      `${track}'s phone mockup (right edge ${Math.round(box.x + box.width)}) overflows the ${clientWidth}px viewport`
    ).toBeLessThanOrEqual(clientWidth + 1);
  }
});

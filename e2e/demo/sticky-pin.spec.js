import { test, expect } from '@playwright/test';
import { stageLocator } from './heroDemoHelpers.js';

// Guards the mechanic DEMO-02/DEMO-05 depend on entirely: `position: sticky`
// pinning the phone mockup in the viewport while its much taller track
// (see HeroDemo.module.css's ".track" comment - the height differs between
// the stacked and two-column layouts, which is why the samples below are
// taken as fractions of the measured pin range rather than as fixed pixel
// offsets) scrolls past
// underneath it. jsdom has no layout engine and cannot execute
// `position: sticky` at all, so nothing else in this repo's test suite can
// catch this.
//
// This is worth a dedicated guard because `position: sticky` is killed
// *silently* - no error anywhere - by any ancestor that gains `overflow`,
// `transform`, `filter` or `contain` (CLAUDE.md, DEMO-05). The blur story is
// in the middle of gaining a real `filter: blur()` on `.blur-value`
// (HeroDemo.module.css); if that filter, or an `overflow` rule, ever lands
// one element too high in the tree - or the whole component gets nested
// inside one of index.astro's `overflow-hidden` FeatureCard wrappers again
// - the sticky pin breaks and this is the only test that would notice.
test.use({ serviceWorkers: 'block' });

test('the sign track stage stays pinned while its track scrolls', async ({ page }) => {
  await page.goto('/');

  const track = page.locator('[data-hero-track="sign"]');
  const trackBox = await track.boundingBox();
  expect(trackBox, 'sign track never rendered').not.toBeNull();
  // Non-vacuity: the track must actually be the many-viewports-tall
  // scroll-jacking distance the pin needs room to work inside, not a
  // collapsed 0-height box that would make every sample below trivially
  // "pinned" by having nowhere to move from.
  expect(trackBox.height, 'sign track is not tall enough to exercise pinning (vacuous)').toBeGreaterThan(2000);

  const stage = stageLocator(page, 'sign');

  // Scroll to just inside the top of the track so the stage is pinned, and
  // record its rect as the pinned baseline.
  await page.evaluate((top) => window.scrollTo(0, top + 50), trackBox.y);
  await expect(stage).toBeVisible();
  const baseline = await stage.boundingBox();
  expect(baseline, 'stage did not render once scrolled into the track').not.toBeNull();
  expect(baseline.width, 'stage is vacuously sized').toBeGreaterThan(50);
  expect(baseline.height, 'stage is vacuously sized').toBeGreaterThan(50);

  // Sample well inside the track's scroll range, comfortably clear of the
  // release point at the very end, and assert the stage's own screen
  // position never moves - a killed sticky context would show it scrolling
  // away (its y tracking the scroll delta) instead of holding still.
  //
  // Fractions of the measured pin range, not fixed pixel offsets. A sticky
  // element is only pinned for (track height - its own height) of scrolling,
  // and this component now runs two sets of track heights - the shorter
  // stacked one and the taller two-column one - so a hardcoded 2400px sample
  // silently becomes a sample past the release point at some viewport
  // widths, which reads as "sticky broke" when nothing did.
  const pinRange = trackBox.height - baseline.height;
  expect(pinRange, 'stage is as tall as its track, so it can never pin (vacuous)').toBeGreaterThan(400);

  for (const fraction of [0.25, 0.5, 0.75]) {
    const delta = Math.round(pinRange * fraction);
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((y) => window.scrollTo(0, y), trackBox.y + 50 + delta);
    // eslint-disable-next-line no-await-in-loop
    const box = await stage.boundingBox();
    expect(box, `stage disappeared after scrolling ${delta}px further into the track`).not.toBeNull();
    expect(
      Math.abs(box.y - baseline.y),
      `stage moved from y=${baseline.y} to y=${box.y} after scrolling ${delta}px further into the track - ` +
        'position: sticky is not pinning it (an ancestor likely gained overflow/transform/filter/contain)'
    ).toBeLessThan(2);
  }
});

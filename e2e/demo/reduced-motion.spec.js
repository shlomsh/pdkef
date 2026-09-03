import { test, expect } from '@playwright/test';
import { TRACKS, stageLocator, layerLocators, layerOpacities, visibleIndexes } from './heroDemoHelpers.js';

// Guards DEMO-02/DEMO-05's "readable under prefers-reduced-motion: reduce"
// requirement. jsdom has no media-query emulation and no layout engine, so
// it cannot see what this CSS actually does: per HeroDemo.module.css's
// "Layer visibility/crossfade" comment, reduced motion drops the
// absolutely-positioned crossfade stack entirely and every `.layer`
// becomes an ordinary flex block stacked in *normal document flow* inside
// the phone's own `overflow: hidden` screen. Only a real browser with real
// layout can tell you whether that stack still fits.
test.use({ serviceWorkers: 'block' });

test('under prefers-reduced-motion: reduce, both stories render as a complete, unclipped still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  for (const track of TRACKS) {
    const stage = stageLocator(page, track);
    await expect(stage, `${track} track stage never rendered`).toBeVisible();

    const screen = stage.locator('[class*="_screen_"]').first();
    const screenBox = await screen.boundingBox();
    expect(screenBox, `${track}'s phone screen never rendered`).not.toBeNull();
    expect(screenBox.width, `${track}'s phone screen is vacuously sized`).toBeGreaterThan(50);
    expect(screenBox.height, `${track}'s phone screen is vacuously sized`).toBeGreaterThan(50);

    const layers = layerLocators(stage);
    const opacities = await layerOpacities(stage);
    const visible = visibleIndexes(opacities);

    expect(
      visible.length,
      `${track} track should show exactly one finished layer at rest, saw opacities [${opacities.join(', ')}]`
    ).toBe(1);

    const visibleLayer = layers.nth(visible[0]);
    const box = await visibleLayer.boundingBox();
    expect(box, `${track}'s finished layer is not actually rendered`).not.toBeNull();
    expect(box.width, `${track}'s finished layer is vacuously sized`).toBeGreaterThan(50);
    expect(box.height, `${track}'s finished layer is vacuously sized`).toBeGreaterThan(50);

    // The layer the crossfade formulas pick as "visible" is one of several
    // now stacked in normal document flow (see the file comment above):
    // the other, invisible layers still occupy real height above or below
    // it. What must still hold - the actual acceptance bar - is that the
    // visible layer's own box sits entirely inside the phone's own
    // overflow:hidden screen. If the invisible layers stacked ahead of it
    // push it past that edge, its ending is silently sliced off with no
    // error anywhere: this is the exact geometry of a real bug found while
    // building this guard (see this suite's report/commit message).
    expect(
      box.y,
      `${track}'s finished layer starts above its own phone screen (clipped at the top)`
    ).toBeGreaterThanOrEqual(screenBox.y - 1);
    expect(
      box.y + box.height,
      `${track}'s finished layer is clipped by its phone screen: layer bottom ` +
        `${Math.round(box.y + box.height)} exceeds screen bottom ${Math.round(screenBox.y + screenBox.height)}`
    ).toBeLessThanOrEqual(screenBox.y + screenBox.height + 1);

    const text = ((await visibleLayer.textContent()) || '').trim();
    expect(text.length, `${track}'s finished layer carries no readable text`).toBeGreaterThan(10);
  }
});

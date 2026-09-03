import { test, expect } from '@playwright/test';
import { TRACKS, stageLocator, layerLocators, layerOpacities, visibleIndexes } from './heroDemoHelpers.js';

// Guards DEMO-02's "readable with JavaScript disabled" requirement (the
// hero demo inherits this straight from DEMO-05's original acceptance
// criteria). jsdom cannot prove this: there is no rendering pass in this
// repo's unit suite that turns scripts off and asks "does the CSS alone
// produce a real picture" - computed opacity resolved from CSS custom-
// property defaults is exactly the kind of thing jsdom does not compute,
// because it does not lay anything out.
//
// ScrollDriver.tsx never runs without JS, so every `--p-*` beat custom
// property sits at HeroDemo.module.css's `.stage-base` default (all beats
// default to 1, i.e. "finished", except the tap pulse which defaults to 0 -
// see that file's comment). The failure mode this guards against: a beat
// default mistakenly written as 0 instead of 1, which silently produces a
// blank crossfade layer instead of a finished one. Nothing throws and
// nothing logs; the page just quietly shows less than it should.
test.use({ javaScriptEnabled: false, serviceWorkers: 'block' });

test('with JavaScript disabled, both stories degrade to one complete, visible still', async ({ page }) => {
  await page.goto('/');

  for (const track of TRACKS) {
    const stage = stageLocator(page, track);
    await expect(stage, `${track} track stage never rendered`).toBeVisible();

    const stageBox = await stage.boundingBox();
    expect(stageBox, `${track} stage has no real box`).not.toBeNull();
    // Non-vacuity: a selector that stopped matching, or a 0x0 rect, must
    // fail loudly here rather than let every assertion below pass on
    // nothing (CLAUDE.md's "vacuous geometry tests" hazard).
    expect(stageBox.width, `${track} stage is vacuously sized`).toBeGreaterThan(50);
    expect(stageBox.height, `${track} stage is vacuously sized`).toBeGreaterThan(50);

    const layers = layerLocators(stage);
    const layerCount = await layers.count();
    expect(layerCount, `${track} track has no crossfade layers at all - selector may be stale`).toBeGreaterThan(0);

    const opacities = await layerOpacities(stage);
    const visible = visibleIndexes(opacities);

    // Exactly one layer must read as the finished frame: zero means a
    // blank panel (the bug this test exists for), more than one means a
    // garbled double-exposure of two screens at once. Both are real
    // regressions a visitor would notice immediately.
    expect(
      visible.length,
      `${track} track should show exactly one finished layer at rest, saw opacities [${opacities.join(', ')}]`
    ).toBe(1);

    const visibleLayer = layers.nth(visible[0]);
    const box = await visibleLayer.boundingBox();
    expect(box, `${track}'s finished layer is not actually rendered`).not.toBeNull();
    expect(box.width, `${track}'s finished layer is vacuously sized`).toBeGreaterThan(50);
    expect(box.height, `${track}'s finished layer is vacuously sized`).toBeGreaterThan(50);

    const text = ((await visibleLayer.textContent()) || '').trim();
    expect(text.length, `${track}'s finished layer carries no readable text`).toBeGreaterThan(10);
  }
});

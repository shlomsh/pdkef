import { test, expect } from '@playwright/test';
import { TRACKS, stageLocator, layerLocators, layerOpacities, visibleIndexes } from './heroDemoHelpers.js';

// Guards DEMO-02's "readable with JavaScript disabled" requirement (the
// hero demo inherits this straight from DEMO-05's original acceptance
// criteria) and DEMO-09's "only one story on screen at rest" fix. jsdom
// cannot prove either: there is no rendering pass in this repo's unit suite
// that turns scripts off and asks "does the CSS alone produce a real
// picture" - computed opacity resolved from CSS custom-property defaults is
// exactly the kind of thing jsdom does not compute, because it does not lay
// anything out.
//
// ScrollDriver.tsx never runs without JS, so every `--p-*` beat custom
// property on [data-hero-stage] sits at HeroDemo.module.css's `.stage`
// default (the *hydrated-start* state, what ScrollDriver would write at
// scroll position 0 - empty/unfilled for most beats). public/hero-demo-
// noscript.css overrides `[data-hero-stage]` back to the finished story
// (every beat at 1, except the tap pulse) for exactly the no-JS audience -
// this applies to both tracks' stages alike, so each one's own crossfade
// layers still resolve to "finished" underneath. See
// heroDemoStageDefaults.test.js for both halves of that contract.
//
// That is not enough to make the *second* story correctly invisible, though:
// before DEMO-09, HeroDemo.module.css gave [data-hero-track="blur"] no
// default of its own for --story-slide/--caption-opacity/--story-opacity, so
// those fell back to .track's var() fallbacks (0%, 1, 1) - the *first*
// track's own progress-0 values, matching only by coincidence - and the
// second story's phone and caption rendered fully visible, stacked directly
// on the first, with or without JS. The fix gives that track explicit
// defaults (slid fully off, opacity 0) matching what ScrollDriver.tsx itself
// would write there at scroll position 0, so a no-JS visitor - who never
// runs ScrollDriver at all - never sees anything else.
test.use({ javaScriptEnabled: false, serviceWorkers: 'block' });

test('with JavaScript disabled, only the first story renders as a complete, visible still', async ({ page }) => {
  await page.goto('/');

  const [firstTrack, secondTrack] = TRACKS;

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
    // blank panel, more than one means a garbled double-exposure of two
    // screens at once. Both are real regressions a visitor would notice
    // immediately. True of both tracks' own internal crossfade layers -
    // the noscript stylesheet finishes both stories' beats alike - which is
    // exactly why this loop cannot by itself tell "first story, correctly
    // shown" from "second story, incorrectly shown": see the track-level
    // check below.
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

  // The second story must actually be hidden, not merely uncounted by the
  // per-stage loop above. Its phone and caption - the two elements gated by
  // --story-opacity/--caption-opacity on [data-hero-track="blur"] itself -
  // must both compute to opacity 0, so nothing of the second story overlaps
  // or shows through the first (the bug DEMO-09 fixed).
  // The compiled CSS Modules class name for `.phone`/`.caption` is
  // `_phone_<hash>_<n>`/`_caption_<hash>_<n>` (leading underscore) - a bare
  // `phone_`/`caption_` substring also matches compound classes like
  // `.blank-value-phone` (`_blank-value-phone_<hash>_<n>`), so the leading
  // underscore is load-bearing here, not decorative.
  const secondStage = stageLocator(page, secondTrack);
  const secondPhone = secondStage.locator('[class*="_phone_"]');
  const secondCaption = secondStage.locator('[class*="_caption_"]').first();
  await expect(secondPhone, `${secondTrack} phone should be hidden at rest`).toHaveCSS('opacity', '0');
  await expect(secondCaption, `${secondTrack} caption should be hidden at rest`).toHaveCSS('opacity', '0');

  // And the first story's own phone/caption must be the ones actually shown.
  const firstStage = stageLocator(page, firstTrack);
  const firstPhone = firstStage.locator('[class*="_phone_"]');
  const firstCaption = firstStage.locator('[class*="_caption_"]').first();
  await expect(firstPhone, `${firstTrack} phone should be visible at rest`).toHaveCSS('opacity', '1');
  await expect(firstCaption, `${firstTrack} caption should be visible at rest`).toHaveCSS('opacity', '1');
});

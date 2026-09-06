import { trackProgress } from '../../src/components/HeroDemo/storySplit.ts';
// Shared helpers for the HeroDemo (DEMO-02) degraded-state guards in this
// directory. HeroDemo.astro renders two independent "tracks"
// (data-hero-track="sign" | "blur"), each a phone mockup that stacks
// several crossfading `.layer` elements inside one sticky
// `[data-hero-stage]`. Only structural attributes (`data-hero-track`,
// `data-hero-stage`) and CSS Module class-name substrings are addressable
// from here, never copy strings - the two stories are being rewritten
// independently of this test suite, and a test asserting exact wording
// would break on the next copy pass for no functional reason.
//
// CSS Modules here compile to hashed-but-prefixed selectors (verified
// against a real build, e.g. `_chat-layer_1s0tw_392`,
// `_screen_1s0tw_272`), so `[class*="foo_"]` reliably matches regardless of
// the build's hash, the same pattern already used by e2e/sign specs
// (`[class*="page-overlay"]`).

export const TRACKS = ['sign', 'blur'];

export function demoSection(page) {
  return page.locator('section:has([data-hero-track])');
}

export function stageLocator(page, track) {
  return page.locator(`[data-hero-track="${track}"] [data-hero-stage]`);
}

export function layerLocators(stage) {
  return stage.locator('[class*="-layer_"]');
}

/**
 * Computed opacity (as a number) of every `.layer` element in a stage's
 * crossfade stack, in DOM order. HeroDemo.module.css's "Layer
 * visibility/crossfade" comment is the ground truth for why exactly one of
 * these should read ~1 at rest under both no-JS and reduced motion.
 */
export async function layerOpacities(stage) {
  const layers = layerLocators(stage);
  const count = await layers.count();
  const opacities = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const opacity = await layers.nth(i).evaluate((el) => getComputedStyle(el).opacity);
    opacities.push(Number(opacity));
  }
  return opacities;
}

export function visibleIndexes(opacities) {
  return opacities.map((o, i) => (o > 0.5 ? i : -1)).filter((i) => i >= 0);
}

export async function scrollStory(page, key, fraction) {
  // Derived, never copied. These fractions used to be spelled out here as
  // 0.57 / 0.62 / 0.37, so retiming the demo in ScrollDriver.tsx left every
  // scroll-driven test scrolling to a position the driver no longer mapped to
  // the beat being asserted.
  const progress = trackProgress(key, fraction);
  await page.evaluate(({progress, fraction}) => {
    const tour = document.getElementById('home-tour');
    const scene = tour.querySelector('[data-working-area]');
    // `travel` is exactly the scene's sticky range, so the nudge that makes
    // the final beat land on a clean 1 must not be allowed past it: two pixels
    // beyond the end unpins the scene by two pixels, and sticky-pin.spec.js
    // then reads that as the stage having moved during the story.
    //
    // This only became reachable when the track mapping was corrected. The old
    // literals put the second story's end at 0.62 + 0.37 = 0.99, an accidental
    // 1% short of the end of travel, so the nudge had somewhere to go. It now
    // ends at 1.0, where there is nothing left.
    const travel = tour.offsetHeight - scene.offsetHeight;
    const start = tour.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(scene).top);
    window.scrollTo(0, start + Math.min(travel * progress + (fraction === 1 ? 2 : 0), travel));
  }, {progress, fraction});
  await expectProgress(page, key, fraction);
}
async function expectProgress(page, key, fraction) {
  const { expect } = await import('@playwright/test');
  await expect.poll(() => stageLocator(page, key).evaluate(el => Number(el.style.getPropertyValue('--p-track')))).toBeCloseTo(fraction, 2);
}

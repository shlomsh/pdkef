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

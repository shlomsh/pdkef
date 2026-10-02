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
  // Was `section:has([data-hero-track])`, which matched only the HeroDemo
  // section on its own. The homepage restructure nested HeroDemo inside
  // `.home-hero`, itself a `<section>` that also contains both hero tracks,
  // so the old selector now matches two elements and Playwright's strict
  // mode rejects it. Target the demo's own identity instead - the
  // `data-home-demo` attribute HeroDemo.astro sets on its root - which stays
  // unique regardless of what wraps the demo.
  return page.locator('section[data-home-demo]');
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
  // The observation happens inside the page, in the frames right after the
  // scroll, and the poll round-trips to Playwright are gone (QUAL-20). The
  // driver only holds the demo to the scroll position for SCRUB_HOLD_MS
  // (1.8s) after a scroll event; after that autoplay walks --p-track away from
  // it (sign .81 reads 1 about five seconds later and stays there). Polling
  // from the test process raced that hold: a worker stalled for a few seconds
  // between scrollTo and the first sample saw autoplay's value, 1 for 10s,
  // and no tolerance or timeout could have caught it back up. Two more
  // ways the driver can end up not showing the scrolled-to position, both
  // handled by the loop below: it listens only to scroll events, so a scrollTo
  // to the spot the page already sits at (scroll restoration after a reload)
  // fires none; and a scroll that lands before it hydrates is never seen.
  const observed = await page.evaluate(async ({ key, progress, fraction }) => {
    // Mirrors ScrollDriver.tsx's resolvePin(): the pinned element (and the
    // track it travels through) differs by breakpoint - desktop pins the
    // whole hero through #home-tour, mobile pins only the demo frame through
    // its own shorter .demo-track - so it has to be resolved from markup
    // instead of hardcoded, or this scrolls the wrong element's sticky range
    // on whichever viewport a given test runs at.
    const resolveTarget = () => {
      const pin = [...document.querySelectorAll('[data-demo-pin]')]
        .find(el => getComputedStyle(el).position === 'sticky');
      const track = pin && document.querySelector(`[data-demo-track="${pin.dataset.demoPin}"]`);
      // `travel` is exactly the pin's sticky range, so the nudge that makes
      // the final beat land on a clean 1 must not be allowed past it: two pixels
      // beyond the end unpins the frame by two pixels, and sticky-pin.spec.js
      // then reads that as the stage having moved during the story.
      //
      // This only became reachable when the track mapping was corrected. The old
      // literals put the second story's end at 0.62 + 0.37 = 0.99, an accidental
      // 1% short of the end of travel, so the nudge had somewhere to go. It now
      // ends at 1.0, where there is nothing left.
      const travel = track.offsetHeight - pin.offsetHeight;
      // Recomputed on every pass, not once: lazy content above the track can
      // move `start` between one pass and the next.
      const start = track.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(pin).top);
      return start + Math.min(travel * progress + (fraction === 1 ? 2 : 0), travel);
    };
    const stage = document.querySelector(`[data-hero-track="${key}"] [data-hero-stage]`);
    const read = () => Number(stage.style.getPropertyValue('--p-track'));
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    // Two frames: the driver's own scroll handler defers to a requestAnimationFrame
    // (ScrollDriver.tsx onScroll), so the first frame only schedules the write.
    const frames = async () => { await frame(); await frame(); };
    const deadline = performance.now() + 8000;
    let target = resolveTarget();
    for (;;) {
      window.scrollTo(0, target);
      await frames();
      target = resolveTarget();
      const settled = Math.abs(scrollY - target) < 1;
      const value = read();
      // Same tolerance the poll used: toBeCloseTo(fraction, 2).
      if (settled && Math.abs(value - fraction) < 0.005) return { scrollY, target, value };
      if (performance.now() > deadline) return { scrollY, target, value };
      // Off the target, or on it with the demo not following: step one pixel
      // away and back so the driver gets a scroll event to scrub from.
      window.scrollTo(0, target - 1);
      await frames();
    }
  }, { key, progress, fraction });
  const { expect } = await import('@playwright/test');
  expect(Math.abs(observed.scrollY - observed.target), 'the page settles on the scroll position asked for').toBeLessThan(1);
  expect(observed.value, `${key} --p-track at that scroll position`).toBeCloseTo(fraction, 2);
}

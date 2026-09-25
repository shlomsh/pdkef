---
id: "DEMO-09"
title: "Hero demo shows both stories stacked until ScrollDriver hydrates"
status: "done"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-25"
---

# DEMO-09 · Hero demo shows both stories stacked until ScrollDriver hydrates

## Bug

Measured on pdkef.com, 1440x900, 4x CPU throttle: on page load the home hero demo shows both stories
stacked on top of each other until the `ScrollDriver` island hydrates (~400-600ms). The two captions
("Keep files private" / "Fill, sign, send it back") print over each other and the second story's phone
covers the first. Then JS slides the second story away. A visitor sees "the second demo on top of the
first, then it hides".

## Cause

`src/components/HeroDemo/HeroDemo.astro` renders two `[data-hero-track]` panels
(`data-hero-track="sign"` and `data-hero-track="blur"`), both `position: absolute; inset: 0` inside the
same stack (`HeroDemo.module.css`'s `.track`). `.track`'s transform reads `var(--story-slide, 0%)` and
`.caption`/`.progress-rail`/`.phone` read `var(--caption-opacity, 1)` / `var(--story-opacity, 1)`.
Only `ScrollDriver.tsx` (on mount, and on every scroll/autoplay frame after) ever sets those three
custom properties, and only on the two `[data-hero-track]` elements directly - `HeroDemo.module.css` had
no default for them at all. `--story-slide`'s fallback (`0%`) and both opacity fallbacks (`1`) happen to
equal the *first* track's own progress-0 values (by coincidence: `crossfade` is `0` at scroll position
0, and the `sign` track's formulas both evaluate to those same numbers there), but the *second* track's
real progress-0 values are `--story-slide: 100%`, `--caption-opacity: 0`, `--story-opacity: 0` - slid
fully off and invisible. With no default at all, the second track rendered stacked directly on the
first, fully visible, until `ScrollDriver` hydrated and corrected it.

This is the same class of bug `heroDemoStageDefaults.test.js` already guards for the per-beat `--p-*`
custom properties on `.stage` (fixed earlier: the CSS defaults there were changed to match what
`ScrollDriver.tsx` writes at scroll position 0) - it was just never extended to the track-level
`--story-slide`/`--caption-opacity`/`--story-opacity` trio.

## Fix

- `HeroDemo.module.css`: give `[data-hero-track="blur"]` explicit defaults for `--story-slide` (`100%`),
  `--caption-opacity` (`0`) and `--story-opacity` (`0`) - exactly what `ScrollDriver.tsx`'s `update()`
  writes onto that track at scroll position 0. The `sign` track needs no override: its own progress-0
  values already equal the three properties' `var()` fallbacks.
- `ScrollDriver.tsx`: extracted the inline `storySlide`/`storyVisible` math out of `update()` into an
  exported pure function (`computeTrackVisibility`), the same pattern `computeStageBeats` already
  established for the per-beat math, so a test can compute "what ScrollDriver writes at progress 0"
  through the real implementation rather than a hand copy that can drift.
- New unit test in `heroDemoStageDefaults.test.js`: parses the real `[data-hero-track="blur"]` rule out
  of `HeroDemo.module.css` and asserts it equals `computeTrackVisibility('blur', 0)`.
- No-JS: this same CSS fix also hides the second story for a no-JS visitor (the module CSS applies
  regardless of JS), so `e2e/demo/no-js.spec.js` was updated from asserting both stories degrade to a
  visible still (never actually true - the two tracks overlapped) to asserting only the first story's
  phone/caption are visible and the second story's are at `opacity: 0`.
- Stale comment fixed: `ScrollDriver.tsx`'s `enter` beat comment referenced a `.stage-first` opacity
  rule that no longer exists in `HeroDemo.module.css`; corrected to say `--p-enter` is currently
  unconsumed (matching `HeroDemo.module.css`'s own accurate comment on that property, which was
  verified and left alone). `HeroDemo.module.css`'s share-sheet sticky-hazard comment had the same
  stale `.stage-first` reference; corrected to `.stage`.

## Acceptance

- [x] `HeroDemo.module.css` gives the `blur` track explicit progress-0 defaults matching
      `ScrollDriver.tsx`.
- [x] `heroDemoStageDefaults.test.js` guards the track-level defaults the same way it already guards the
      per-beat `.stage` defaults.
- [x] `e2e/demo/no-js.spec.js` asserts the real (fixed) no-JS behaviour: first story visible, second
      story's phone/caption at `opacity: 0`.
- [x] `npm run check:fast` passes.
- [x] `npm run build` and the demo/home Playwright specs (`e2e/demo/*.spec.js`,
      `e2e/home/scrollable-hero.spec.js`) pass against the build.
- [x] Visually verified: a no-JS screenshot of `/` at 1440x900 shows exactly one caption and one phone.

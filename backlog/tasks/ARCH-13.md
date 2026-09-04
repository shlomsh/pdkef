---
id: "ARCH-13"
title: "Restore CSS delivery-budget headroom"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-04"
---

## Problem

The CSS release gate is green but has effectively exhausted its safety margin. On 2026-09-03,
`npm run test:css` reported a 9.46x duplication factor against a 9.60x limit and 27,683 dead bytes
on `/licenses/` against a 27,750-byte limit. Across the site, 398,528 bytes are classified as dead
for their page, including 357,236 bytes of utility CSS. A small legitimate UI change can therefore
break the release gate without representing a meaningful regression, which encourages repeated
budget increases instead of correcting the delivery model.

## Scope

- Attribute the repeated and page-dead bytes to their source stylesheets and build configuration.
- Reduce utility/style delivery to routes that do not use it, prioritizing static pages and the
  shared shell before changing editor styles.
- Preserve Astro static output, the production CSP, offline behavior, responsive layouts, and the
  existing CSS Modules ownership boundaries.
- Record before/after measurements and explain any CSS that must remain globally delivered.
- Keep the CSS gate based on generated output; do not make it source-line-count based.

## Acceptance criteria

- The duplication factor and worst-page dead-byte result each have at least 10% headroom below their
  current limits without raising those limits.
- `npm run build`, `npm run test:css`, `npm run test:csp`, `npm run test:weight`, and relevant visual
  or responsive browser checks pass.
- Shared styles are not copied into multiple component modules merely to improve the metric.
- The change includes a short ownership note for global, shell, static-content, and interactive-tool
  CSS so later work does not recreate the duplication.

## Notes

The build also emits Vite's generic warning for a minified chunk over 500 kB, while the route-aware
brotli page-weight gate remains green (`/sign/` was 327,883 of 400,000 bytes). Treat that warning as
a measurement prompt, not as evidence that the CSS fix must also restructure JavaScript chunks.

## Outcome (2026-09-04)

**The delivery model was changed, not the limits.** The utilities layer used to be one repo-wide
Tailwind compilation that `build.inlineStylesheets: 'always'` baked into all 22 pages: 28,656
identical bytes each, of which `/licenses/` used about 2,300. It is now five entry stylesheets in
`src/styles/`, one per page family - `homePage.css`, `toolPage.css`, `contentPage.css`,
`licensesPage.css`, `notFoundPage.css` - each importing `global.css`, then
`tailwindcss/utilities.css` with `source(none)`, then an explicit `@source` list naming the markup
that family renders (the shell's share factored into `sharedSources.css`). Every page imports exactly
one, so no page inlines a utility twice.

### Before / after (22 pages both times, no page added or removed)

| | before | after | limit |
| --- | --- | --- | --- |
| Duplication factor | 8.39x | **5.79x** | 9.60x → 7.00x |
| Worst page dead bytes | 27,308 (`/licenses/`) | **7,567** (`/split/`) | 27,750 → 10,000 |
| Single-page utilities | 144 | 144 | 148 (unchanged) |
| Rule bytes shipped, all pages | 1,162,043 | **813,201** | |
| Distinct rule bytes | 138,434 | 140,435 | |
| Site-wide dead bytes | 402,824 (360,737 utilities) | **95,066** (52,979 utilities) | |

Headroom against the pre-existing limits is 39.7% and 72.7%; against the lowered ones, 17.3% and
24.3%. Distinct bytes rose by 2,001 because the same rule text is now generated into more than one
entry sheet and because `@theme` is `static` - the denominator got slightly worse while the factor
still fell by a third, which is what a real reduction in per-page delivery looks like rather than a
re-measurement.

This is a first-view win on every page, not only a metric one. Brotli CSS in the document:

| page | before | after |
| --- | --- | --- |
| `/licenses/` | 6,665 | 2,162 |
| `/404.html` | 6,665 | 2,777 |
| each content page | 7,423 | 5,050 |
| `/sign/` | 14,905 | 13,453 |
| `/` | 11,979 | 10,748 |
| tool pages | ~10,100-11,200 | ~8,700-9,800 |

Worst document+JS moved 332,276 → 330,917 of 400,000 brotli.

### What had to land with it

`scripts/check-dead-utilities.js` now asks its question **per page**, against that page's own inline
stylesheet, instead of concatenating the whole build. Under one shared sheet the two were equivalent;
under per-family sheets they are not, and the difference is exactly the bug the split could introduce
- a class whose rule was compiled into another family's sheet renders unstyled while still existing
somewhere in the build. A forgotten `@source` is now a named build failure.

### What must stay globally delivered, and why

`global.css` keeps the design tokens (`@theme static` + `:root`), the element defaults (`box-sizing`,
`body`, `main`, `:focus-visible`, the reduced-motion block, the layered `a` and bare-`<header>`
rules) and the `.type-*`/`.space-*` role classes. Every page renders that markup, so scoping it would
copy it rather than shrink it. It is 2,542 bytes of class-bearing CSS at the widest, and it is the
one tier still paid for 22 times - which is why the ownership note says a rule belongs there only if
every page needs it.

`@theme` became `static` in the same change. Tailwind otherwise emits only the tokens its generated
utilities reference; that was survivable when one utility set covered the whole site and is not now
that each family compiles its own, because `--shadow-sm`, `--ease-out`, `--radius-md` and the
`--font-weight-*` steps are read by the editor's CSS Modules, which Tailwind cannot see. Their
emission would otherwise have depended on an unrelated `.astro` file using `shadow-sm` on that same
page. 580 bytes per page, against 563 for the tree-shaken set it replaces.

### Side effect worth recording

The `@source not` list is gone with the repo-wide crawl, which retires the "documentation is not a
template" hazard structurally: with `source(none)`, a new `.md` note, a `docs/` script or a plugin
rule table cannot contribute a utility candidate, because nothing is scanned unless a family asked
for it. The trade is the opposite failure mode - under-sourcing instead of over-sourcing - which the
per-page guard above covers.

### One behaviour change, deliberately kept

Astro emits the page's own stylesheet **before** the components' CSS Modules now, where it used to
emit it after. That was not the goal and it does not follow from the `@import` structure - the order
was tested against import position and against `@import` vs `@reference` and did not move - but it is
a real consequence and worth recording rather than discovering later.

It only matters for the rules in `global.css` that are **unlayered**, since a layered rule loses to
an unlayered module rule at any source order. There are exactly three unlayered class selectors left
(`.sr-only`, `.merge-tool`, `.disclosures` - none of which is ever written on an element that also
carries a CSS Module class) plus `:focus-visible`, and everything else there is an element selector,
`*`, or `#app`, which module classes already beat or lose to on specificity alone.

So the whole delta is `:focus-visible { outline; outline-offset; border-radius: 4px }` against the 59
CSS Module rules that set a `border-radius` at the same specificity. It used to win those ties, which
means a keyboard-focused card in the editor snapped from its own 16px radius to 4px for as long as it
held focus. It now loses them and keeps its own shape, which is what the component asked for. Checked
in the other direction too: no module rule suppresses `outline` at single-class specificity without
defining its own `:focus`/`:focus-visible` ring, so no element loses a focus indicator - verified
mechanically across every `*.module.css`, not by sampling.

Keeping the new order rather than re-encoding the old one is the deliberate call. The old precedence
was an accident of emission order, and it is the same hazard CLAUDE.md Part II §5 already records
twice for unlayered rules beating utilities (`a { color }`, `header:not(.tool-hero)`) - both of which
shipped as bugs. Restoring it would have meant preserving a third instance of it.

### Not done

The Vite 500 kB minified-chunk warning is untouched, per the ticket's note that it is a measurement
prompt rather than part of this fix. The route-aware brotli page-weight gate stays green.

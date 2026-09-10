---
id: "SEO-20"
title: "New tool: crop a PDF, the only one of these with nothing to apologise for"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-06"]
legacy_state: "Open"
---

# SEO-20 · New tool: crop a PDF, the only one of these with nothing to apologise for

## Scope and acceptance

**`crop pdf online` is 30k-70k searches a month, won by launchvibe, toolslabpro and Sejda**, and it is
the best-fitting new tool in the whole research report for reasons that have nothing to do with volume.

**It is lossless.** A crop is a change to the page's `CropBox`, which is metadata. Text stays selectable,
nothing is re-encoded, the file does not grow, and there is no trade-off to disclose - unlike compress,
grayscale, scanned-look or blackout, all of which rasterize and all of which have to warn the reader. In
a product whose positioning rests on being honest about costs, a tool with no cost is worth having.

**And most of it is already built.** Drawing and adjusting a rectangle over a rendered page is exactly
what the Redact tool does. `src/editor/gestures/controller.ts` owns create, drag and resize;
`src/editor/registry/boxResize.ts` owns the per-handle anchor-preserving arithmetic with a single owner
and a CI guard. A crop box is another box. Reuse the core; do not write a second gesture path, and do not
route pointer moves through state - the golden rule in CLAUDE.md Part II §4 is statically enforced by
`scripts/check-gesture-golden-rule.js` and will fail the build.

**Design decisions to make explicitly:**

- One crop for every page, or per page? Per page is more capable and much more UI. One box applied to all
  pages, with an option to apply to a range, is probably the right first version - argue it.
- `CropBox` versus `MediaBox`. Setting `CropBox` is reversible and better behaved; some viewers and some
  printers ignore it. Decide, and say on the page which one we set and what that means.
- Whether the cropped-away content is still in the file. With a `CropBox` change it **is** - the content
  is hidden, not removed. That must be stated on the page, because someone will try to crop out a private
  detail and a hidden-not-removed result is a privacy failure. Point them at `/redact/` for that case.

**Acceptance.**

- Real `src/lib/` logic with no network calls, unit-tested against page geometry with a realistic mocked
  rect - a geometry test against jsdom's default 0x0 rect proves nothing, per CLAUDE.md Part II §5.
- The gesture path reuses `src/editor/`'s controller and box-resize owner; no new copy of the arithmetic;
  `npm run test` and the gesture-rule check pass.
- The page states plainly that cropped content is hidden rather than deleted, and links to `/redact/`.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`.
- `npm run build && npm run preview` CSP and hydration pass.
- Ships alone in its week.

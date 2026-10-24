---
id: "ARCH-33"
title: "Each localized tool page carries only its own tool's CSS"
status: "done"
priority: "P2"
epic: "robustness"
order: 1
depends_on: []
---

# ARCH-33 · Each localized tool page carries only its own tool's CSS

*Filed 2026-10-24* while landing MERGE-24. `src/pages/[locale]/[tool].astro` imports all six localized
tool islands (and `editorFonts.css`) and picks one per page, so Astro inlines every one of those tools'
CSS into every Hebrew tool page. Those six pages are the site's heaviest CSS family, 217KB each against
roughly 100-150KB for the English page of the same tool, and the family-duplication ratchet sat at its
0.65x limit on main: MERGE-24's Merge CSS took it to 0.6502x and stopped `check:push`.

The fix is the one the ratchet names: scope the CSS to the pages that use it. One route file per
localized tool (`src/pages/[locale]/merge.astro` and the rest), each importing only its own island,
over a shared layout and one pure loader for the page's context and messages, so the per-locale logic
stays in one place. `editorFonts.css` goes only to the Sign route, as `sign.astro` does.

## Acceptance

- [x] Each Hebrew tool page inlines only its own tool's island CSS; the six pages fall out of one shared
      family, and `npm run test:css` passes with the limit unchanged.
- [x] The built `/he/<tool>/` pages are otherwise unchanged: same URLs, same canonical, alternates and
      noindex behaviour, same SEO checks (`test:seo`, `test:csp`, `test:redirects`).
- [x] A unit test fails if a localized tool variant has no route file, so a new localized tool cannot
      silently drop out of the build.
- [x] The `/he/` Playwright specs pass.

## Closed 2026-10-24

Shipped with MERGE-24 (c21b5767): `src/i18n/localizedToolPage.ts` (paths and page loader),
`src/layouts/LocalizedToolLayout.astro`, and one route per tool in `src/pages/[locale]/`. The family
ratchet went from 0.6502x to 0.44x with the limit unchanged: each Hebrew tool page now shares its
family with its English twin (for example /merge/ and /he/merge/ at 121,850 bytes) instead of one
six-page family. `test:seo`, `test:csp`, `test:redirects` and the Playwright suite pass;
`localizedToolPage.test.js` was seen failing before the route files existed.

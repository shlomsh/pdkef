---
id: "HERO-02"
title: "One full-height first screen on desktop for the page-grid tools"
status: "done"
priority: "P1"
epic: "tool-pages"
order: 1
depends_on: ["HERO-01"]
---

# HERO-02 · One full-height first screen on desktop for the page-grid tools

*Filed 2026-10-14.* The layout half of [docs/tool-hero-show-the-verb.md](../../docs/tool-hero-show-the-verb.md).
The eight page-grid tools: Merge, Split, Edit Pages, Compress, PDF to Image, Image to PDF, Unlock or
Protect, Compress Image. Sign and Redact are HERO-05.

## Outcome

- At 1024px and up the first screen is one hero of `clamp(600px, 100svh - app bar, 900px)`: the tile,
  the split h1 and the subhead on the left (5fr), the sheet with the drop heading, the privacy line and
  Choose files on the right (7fr), and a footer row with the airplane line and an in-page link to How
  it works.
- Once a file is loaded the hero condenses to one line through the existing `data-hero-condensable`
  path, and the tool card keeps the first-screen height as its `min-height`.
- The basics: two start edges in all, the sheet as the only framed object (no outer card, no dashed
  border), a mint field that fades back to the page colour with no seam, quiet outlined chips with
  On-device unfilled and the plane icon on Works offline, tokens only.
- The h1 is split into the tool name and the rest by a per-tool, per-locale data field. The text
  content of every h1 is unchanged.
- Merge's no-limit note moves word for word to just above How it works.
- Under 1024px the order and the phone first-viewport behaviour are today's.
- `fillViewport` and its CSS are deleted. `styling.md`'s paper line is updated, since the sheet is
  `--color-surface`.

## Guards

- Unit: the two h1 parts join back to the h1 for every tool and locale.
- Playwright (chromium): at 1280x680, 1440x820 and 1920x1040 the h1, the sheet and Choose files are
  fully visible, How it works starts below the fold at the first two, no horizontal overflow.
- `e2e/tool-layout.spec.js` and the phone specs stay green unchanged.
- `test:seo`, `test:css`, `test:weight` and `test:csp` green on a production build.

## Progress

*2026-10-15.* Landed on the branch:

- `bce07cee` the `h1Name` field per tool and locale, and `splitHeroTitle`, with the join-back unit tests.
- `5c9bd584` the quiet On-device chip on tool pages, and a plane on Works offline.
- `110a437d` the two-column desktop first screen (`ToolPageLayout.astro`, `ToolHero.astro`): footer row,
  How it works link, Merge's no-limit note moved to just above How it works. Gated on
  `.tool-stage[data-layout='hero']:not(:has([data-tool-loaded], [data-tool-shell]))` and off under `html[data-draft-hint]` and
  `html[data-merge-restore]`.
- `8a31ed3c` after a file loads, the desktop hero condenses to the icon and the tool's name, on the same
  signals as the older condense rules, and the loaded card keeps `calc(var(--first-screen) - 5.5rem)`.
  This reverses the 2026-09-12 decision to keep page-grid heroes full on desktop.
- `909f6299` `e2e/tool-hero-first-screen.spec.js`, and `e2e/tool-layout.spec.js` checks the stacked eight
  on their own terms.
- `7dee4a35` the screen-tall sheet only on the page-grid first screen; Compress and Compress Image take
  their content's height, Sign and Redact keep a content-height sheet.
- `fillViewport` was removed with the sheet rework in `a1da04b1`.

Done: `styling.md`'s paper line (the sheet is `--color-surface`, `b0a3202e`). Left: `test:seo`, `test:css`,
`test:weight` and `test:csp` on a production build.

*2026-10-15.* The vertical balance pass landed in `7bfc6c02`, and Merge's phone tile went back beside the name in `55b13f13`. Left: `test:seo`, `test:css`, `test:weight` and `test:csp` on a production build.

*2026-10-15.* Closed. The last open item, the production-build checks, ran green on one build of 16e1a61b plus the docs: check:push (22 steps, including test:csp, test:seo, test:css with the duplication ratchet, test:weight), the whole chromium project (430 passed), webkit (35), perf (10).

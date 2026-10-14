---
id: "HERO-02"
title: "One full-height first screen on desktop for the page-grid tools"
status: "in_progress"
priority: "P1"
epic: "tool-pages"
horizon: "now"
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

---
id: "SITE-47"
title: "More tools under a tool page: three doodled stickers, picked for that tool"
status: "in_progress"
priority: "P2"
epic: "tool-pages"
horizon: "now"
depends_on: []
---

# SITE-47 · More tools under a tool page: three doodled stickers, picked for that tool

*Opened 2026-11-07* after Shlomi called the eleven-card "More free PDF tools" grid long and boring. He picked the sticker sheet from four sketches (A sticker sheet, B shelves, C a page's journey, D "I want to...").

## Outcome

Under every tool page the section shows three tilted stickers in the `PromiseStickers` style, each with a pencil doodle of the tool doing its job that plays once on hover or focus. The three are the next steps most likely for that tool (`src/data/relatedTools.js`); a guide page shows the default three. Every other tool keeps a plain link in one quiet row under them, so the internal links ToolCrossLinks exists for stay on every page. The guide cards above keep sitting on the same columns.

## How

- `src/data/relatedTools.js`: one list per listed tool, pure, checked against the registry by `relatedTools.test.js`. Variant pages borrow their parent's list.
- `src/components/ToolDoodle.astro`: one static SVG per tool, strokes and colours as `Doodle.astro`, motion only under `prefers-reduced-motion: no-preference`.
- `src/components/ToolCrossLinks.astro`: stickers for the three, the row for the rest; heading and subhead unchanged.

Telemetry could not rank the pairs: on 2026-11-07 only hand-offs into Unlock carried their origin (21 in 60 days, nearly all from Redact). The lists follow the tools' own finish-state hand-offs and what a file is usually for next.

## Acceptance

- [x] `relatedTools.test.js` green: every listed tool has three distinct other listed tools.
- [x] Every tool page and a guide page show three stickers and a row linking every other listed tool (and, on English pages, the variant pages).
- [x] Measured on a production build at 1440, 900, 768, 767 and 390 on `/compress/`, `/redact/`, `/rotate-pdf/`, `/he/compress/` and `/how-to-sign-a-pdf-on-iphone/`; no sideways scroll. Below 768 the stickers stack with half the tilt; 768 to 960 puts the doodle above the words.
- [x] `tool-layout.spec.js` column guard still green; `test:css`, `test:weight` green.
- [ ] Landed on main.

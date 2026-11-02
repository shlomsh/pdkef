---
id: "READ-03"
title: "Highlight PDF: the tool at /highlight-pdf/, highlights with a comment on each, and its page"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 2
depends_on: ["READ-01", "READ-02"]
---

# READ-03 · The Highlight PDF tool and its page

*Filed 2026-11-01.* Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md). Lands in the same
push as READ-04, so highlighting is never missing from the product.
The behaviour is [READ-01](READ-01.md)'s requirements (R1 to R46); this ticket builds them.

## Outcome

A student opens a paper at `/highlight-pdf/`, on desktop, iPad or phone, digital or scanned. The page fills
the screen. They swipe along a line and get the band, with nothing opening at its end; resting on or tapping
a highlight offers its colors, the underline style, Comment and Delete. Comment opens a card in the margin
beside the passage (a sheet on a phone); Comment over an uncolored line lays the band in the last color
first. A comment exists only on a highlight. Download writes standard annotations that open in any viewer and come back editable here and in
Sign. Color and underline style are remembered per document and become defaults for new ones.

## Touch at launch

On a phone or iPad a tap on Marker arms it and opens nothing, and a tap on Marker again disarms it, as Sign's
tool buttons do; there is no Stop button and no bar at the foot of the screen (R50). While armed, the toolbar
says "Swipe along a line to highlight" (R51); one finger marks only sideways along a line of text, and
otherwise scrolls or moves the page (R52), and two fingers always zoom and move it (R62). A tap on a highlight picks it and opens its panel under the toolbar (R7, R47). Whether the marker is
armed when a file opens on touch is an open call in the design record. Desktop keeps the marker always in the
hand (R1). READ-07 later replaces arming with long-press and drag.

## Acceptance

- [ ] New island `src/tools/highlight/` over the shared shell and editor core; no copy of Sign code.
- [ ] Static SEO shell: title and H1 on "Highlight PDF", description, how-it-works, FAQ (how to highlight,
  removing a highlight, scanned pages, Mac and iPad, comments in other viewers) and matching JSON-LD, in
  voice, every claim checked against the code.
- [ ] Registry entry in `src/data/tools.js`, the non-slash redirect pair in `vercel.json`, the tool count
  updated in CLAUDE.md, README and site copy.
- [ ] The toolbar and panel decisions are pure functions with unit tests, each seen failing first.
- [ ] Export then read-back is lossless, in Highlight PDF and in Sign (one round-trip e2e).
- [ ] `npm run build && npm run preview` checked for CSP; `test:seo`, `test:redirects`, `test:css` pass.

---
id: "READ-03"
title: "Highlight PDF: the tool at /highlight-pdf/, highlights with a comment on each, and its page"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 2
depends_on: ["READ-01", "READ-02"]
needs: "Confirm the name: Highlight PDF"
---

# READ-03 · The Highlight PDF tool and its page

*Filed 2026-11-01.* Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md). Lands in the same
push as READ-04, so highlighting is never missing from the product.

## Outcome

A student opens a paper at `/highlight-pdf/`, on desktop, iPad or phone, digital or scanned. The page fills
the screen with no tool armed. They swipe along a line and get the band; the popup at its end offers the six
colors, the underline style and Comment. Comment opens a card in the margin beside the passage (a sheet on a
phone); Comment over an uncolored line lays the band in the last color first. A comment exists only on a
highlight. Download writes standard annotations that open in any viewer and come back editable here and in
Sign. Color and underline style are remembered per document and become defaults for new ones.

## Acceptance

- [ ] New island `src/tools/highlight/` over the shared shell and editor core; no copy of Sign code.
- [ ] Static SEO shell: title and H1 on "Highlight PDF", description, how-it-works, FAQ (how to highlight,
  removing a highlight, scanned pages, Mac and iPad, comments in other viewers) and matching JSON-LD, in
  voice, every claim checked against the code.
- [ ] Registry entry in `src/data/tools.js`, the non-slash redirect pair in `vercel.json`, the tool count
  updated in CLAUDE.md, README and site copy.
- [ ] The popup's decisions are pure functions with unit tests, each seen failing first.
- [ ] Export then read-back is lossless, in Highlight PDF and in Sign (one round-trip e2e).
- [ ] `npm run build && npm run preview` checked for CSP; `test:seo`, `test:redirects`, `test:css` pass.

---
id: "SCAN-36"
title: "Straighten a scanned PDF: turn, split a book spread, flatten, clean, then read it"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "now"
order: 8
depends_on: ["SCAN-32"]
---

# SCAN-36 · A crooked scanned PDF, made readable

*Opened 2026-11-04* from Shlomi's 8-page PDF for the Highlight tool: 300 dpi one-bit photocopies of
two-page book spreads, lying sideways, lines curving into the spine, dark gutters, an old OCR text layer.

## Outcome (research first)

A prototype, outside the product, that takes such a PDF to straight single pages: the quarter turn
(SCAN-32), the spread split at its spine, each page's lines straightened (SCAN-17's row fit, and why it
finds no bend on these pages today), the squeeze toward the spine undone, the dark gutter and borders
cleaned. Then a product decision with Shlomi: where it lives (Scan taking a PDF in, a hand-off from
Highlight when it opens a crooked scan, or both) and what happens to the old text layer, which no
longer lines up once the pages move (Highlight already reads a scanned page from its image, READ R30).

## Acceptance

- [ ] The prototype's before-and-after pages and what each step needed, in this ticket.
- [ ] The product decision recorded here.

---
id: "SCAN-49"
title: "On a phone the tool card is the first screen"
status: "done"
priority: "P1"
epic: "scan-next"
depends_on: []
---

# SCAN-49 · The card is the hero on a phone

At 390x844 "Start scanning" sat at y=725, below the fold, under the tile, the h1, a six-line subhead and
a tall empty verb. On the page-grid tools' empty state at 640px and under, the card now leads: tile beside
the name, one line, then a card that fills the screen, the tool's verb in an edge-to-edge band taking the
spare height; the subhead is reordered below it, still in the page. The h1 stays the
whole keyword title in the DOM, its tail visually hidden. Sign, Redact and Highlight keep their hero
(`data-editor`; mobile Sign is frozen for patches and their phone hero is pinned by e2e).

## Done when

- At 375x560 both Start scanning and Choose photos are on screen without scrolling.
- Desktop and anything above 640px keep their layout.
- The card ends one gutter above the fold at any phone height, and the verb stays large.
- A heading about dropping does not show where nothing can be dragged.
- The phone Drive line names the button on show; its PDF how-to link appears only on a button for PDFs.

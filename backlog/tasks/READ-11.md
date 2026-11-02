---
id: "READ-11"
title: "Highlight stroke options: a sketched stroke that looks drawn by hand"
status: "open"
priority: "P3"
epic: "highlight-pdf"
horizon: "later"
order: 11
depends_on: ["READ-03"]
---

# READ-11 · Highlight stroke options

*Opened 2026-11-02 from Shlomi's ask, a nice touch on top of the launch.* Today every highlight and
underline is a clean band. One stroke option in the mark panel should look like a sketch: a little
sloppy, with uneven edges and ends that overshoot the line, so the page looks marked with a real pen
rather than a ruler. It serves the reading principle: marking should feel like holding a highlighter,
not like operating software.

## Outcome

The mark panel offers a stroke choice, Clean or Sketch, for both Highlight and Underline. Choosing one
on a mark changes that mark and becomes the stroke of every mark that follows (R5, the pen follows
edits), remembered per document and as the default for new documents (the per-document style rule).
A sketched mark looks the same on screen, in print and in the downloaded PDF.

## Acceptance

- [ ] The stroke is a field of the marker look (`markerState.ts`), carried by R5's rearm like color,
  opacity and thickness, and stored with the mark in the draft.
- [ ] The sketch shape is a pure function of the mark's band and a seed taken from its id, so a reload,
  a print and an export draw exactly the same wobble. Unit tests pin the shape for a fixed seed.
- [ ] The export draws the sketch as a vector path, never a raster.
- [ ] The control fits the one-row panel from 402 px up without growing the row (a third choice inside
  the setting button's popover is the likely home; decide with a sketch first).
- [ ] A sketched highlight keeps the text under it readable at every opacity the slider allows.
- [ ] Checked on a phone: a swipe lays a sketched mark, and the next swipe keeps the choice.

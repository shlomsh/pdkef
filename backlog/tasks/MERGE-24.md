---
id: "MERGE-24"
title: "Merge polish: pages fill the stage, linked files, a download moment"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
order: 1
depends_on: []
---

# MERGE-24 · Merge polish: pages fill the stage, linked files, a download moment

*Picked 2026-10-23 by Shlomi from a before/after sketch (the "Merge polish sketch" canvas).* The loaded
card already holds the first screen, but 104px pages sit in its top strip and the rest is white. Nine
changes, all approved together on the sketch:

1. **Pages fill the stage** (desktop, 1024px and up): the largest cell, 104 to 240px, that fills the grid's
   width at some column count while every row fits the card's first-screen floor. 104px stays the floor;
   below it the grid wraps and scrolls as today. Thumbnails rasterise at the cell's size (stepped), so a
   bigger page is still sharp. Phone and tablet keep today's sizes.
2. **The file colour is on the page**: a 4px band on each page's top edge replaces the floating dot. The
   third tag colour is a new `--color-clay` instead of `--color-danger`, which read as an error.
3. **Linked files**: hover or focus a rail row and its pages lift while the rest step back; hover or
   focus a page and its row lights up. Nothing on touch, nothing during a drag.
4. **Pages arrive**: a thumbnail fades and rises into its cell as it renders.
5. **The download moment**: on Download, the bands sweep to one colour, left to right, as the saved check
   draws, then return. Skipped under reduced motion.
6. **The heading cuts in the middle** and keeps the tail ("…itc1040 (final) (3)"), with a real space
   before "· 7 pages".
7. **"Pages moved across files"**: the note fits its one line instead of being cut (English copy).
8. **Page counts carry a page mark** in the rail rows.
9. **Below the card, one line**: the airplane line sits close under a loaded card, and the SEO-10 line
   ("Combine as many files…") stays in the HTML but hides once files are loaded, like the subhead.

## Contract between the pieces

- Page cells (`PageStrip.tsx` `<li>`) carry `data-file-id`, `--tag-color` and `--moment-delay`; rail rows
  carry `data-file-id`.
- `useLinkedHighlight` sets `data-linking="row" | "page"` on the layout root and `data-linked` on every
  element sharing the hovered or focused `data-file-id`. CSS reads only those attributes.
- The moment is `data-merge-moment` on the layout root for its duration; the bands' CSS reads it.
- Sizing is the pure `fitCellWidth` / `rasterWidthFor` in `src/tools/merge/lib/stageFit.ts`; the hook
  only measures.

## Acceptance

- [ ] At 1280x900 with three files (7 pages) the pages are wider than 104px and the last row ends inside
      the card's first screen; at 30 pages they are 104px as today.
- [ ] Unit tests cover `fitCellWidth` and `rasterWidthFor`, seen failing first.
- [ ] Hover and focus link rows and pages both ways; touch and drag show nothing.
- [ ] 820 and 375 look as they do today apart from the band, the copy and the rail mark.
- [ ] `/he/merge/` keeps its name order and middle cut with a Hebrew file name.
- [ ] `check:push` green.

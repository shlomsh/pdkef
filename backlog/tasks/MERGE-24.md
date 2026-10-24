---
id: "MERGE-24"
title: "Merge polish: pages fill the stage, linked files, a download moment"
status: "done"
priority: "P2"
epic: "polish"
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

Added on the dev server the same day, from Shlomi's review:

10. **No bottom sheet below 1024px** (the Sign and Redact rule, QUAL-27): the file row is a sticky bar
    under the app bar with a quiet Download; page numbers, the filled Download and the next steps are a
    completion row under the last page. UX guideline sections 8 and 15 now say this.
11. **The rail clears the app bar**: it sticks below it, and with many files its list scrolls inside
    while Download stays pinned at its foot.

Added on 2026-10-24, from Shlomi's review, a code review and a QA pass:

12. **The top Download opens the done strip** below 1024px, Redact's strip (now `src/shell/DoneStrip`,
    shared): what was saved, Compress and Sign, then the rating ask.
13. **Each file chip has a remove button** below 1024px, with the rail's undo.
14. **Below 1024px the card ends at its pages** (no grid minimum, no reserved skipped slot, main does
    not stretch), and the phone heading is one run of text.
15. **The grid shows once its fit settles** at every width, so a restore does not shift.

The target, width by width, is [docs/merge-stage-spec.md](../../docs/merge-stage-spec.md).

## Contract between the pieces

- Page cells (`PageStrip.tsx` `<li>`) carry `data-file-id`, `--tag-color` and `--moment-delay`; rail rows
  carry `data-file-id`.
- `useLinkedHighlight` sets `data-linking="row" | "page"` on the layout root and `data-linked` on every
  element sharing the hovered or focused `data-file-id`. CSS reads only those attributes.
- The moment is `data-merge-moment` on the layout root for its duration; the bands' CSS reads it.
- Sizing is the pure `fitCellWidth` / `rasterWidthFor` / `rasterWidthForItem` / `fitSettled` in `src/tools/merge/stageFit.ts`; the hook
  only measures.

## Acceptance

- [x] At 1280x900 with three files (7 pages) the pages are wider than 104px and the last row ends inside
      the card's first screen; at 30 pages they are 104px as today.
- [x] Unit tests cover `fitCellWidth` and `rasterWidthFor`, seen failing first.
- [x] Hover and focus link rows and pages both ways; touch and drag show nothing.
- [x] At 820 and 375 nothing is pinned to the bottom; scrolled to the last page, the quiet Download is
      in view and the completion row follows the last page.
- [x] With 15 files at 1280x900, scrolled, the rail's first row is below the app bar and Download is
      inside the viewport.
- [x] `/he/merge/` keeps its name order and middle cut with a Hebrew file name.
- [x] `check:push` green.

## Closed 2026-10-24

Verified on a production build: the MERGE-24 path matrix passes all 93 lines of
[docs/merge-stage-spec.md](../../docs/merge-stage-spec.md) (desktop, tablet, phone, Hebrew), a fresh code
review's eight findings and a QA pass's findings are fixed with tests seen failing first, and restore
layout shift is 0.0002 (was 0.052 on desktop, 0.064 on a phone). The lessons are in
[docs/ux-design-guidelines.md](../../docs/ux-design-guidelines.md) sections 5, 8, 10, 14, 15, 18 and 19.
Left as decided before this ticket: phone thumbnails rasterise at 96px, and short-run tags cut at the end.

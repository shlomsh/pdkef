---
id: "DEBT-52"
title: "Compress's options grow 88px after a handed-over file loads"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-52 · Compress's options grow 88px after a handed-over file loads

*Filed 2026-10-15 while guarding HERO-02's hand-off path.* On /compress/, about 80ms after a file
arrives by hand-off, the options area grows about 88px (its own async layout, likely the estimate row
in `src/tools/compress/PdfCompressTool.tsx`; confirm the element before fixing). That is a layout shift
of about 0.028 on about half of loads, with no input on the page. The HERO-02 hand-off guard therefore
uses Split, not Compress.

## Outcome

The options reserve their final height before the estimate arrives, and the hand-off guard in
`e2e/tool-hero-first-screen.spec.js` also runs on /compress/ with CLS < 0.01.

## Progress

- 2026-10-15: The element that moved was not the estimate row. A layout-shift `sources` probe showed
  `.compress-options` (and everything below it) dropping 88px at about 95ms, because the "nothing to
  shrink" note (`p.honest-note`, 74px plus margin and gap) is inserted above it once `analyze()` has read
  the PDF. Fix: while a PDF's analysis is pending (new `analysisPending` state, cleared on result or
  failure), `PdfCompressTool.tsx` renders the same `honest-note` box hidden (`.note-reserve`,
  `visibility: hidden`, `aria-hidden`), so the slot exists from the first render. The hand-off guard in
  `e2e/tool-hero-first-screen.spec.js` now loops over split and compress. Red before the fix: 6/6
  failed on /compress/ with CLS 0.029. Green after: 6/6 pass, whole spec plus `src/tools/compress/e2e` 60/60.
  A PDF that has images gets the shorter `compress-warning` note instead, so its reserved slot is a
  little taller than the note and shrinks on arrival; not covered by this fixture.

Left (lead review, 2026-10-15): the reserved slot assumes the text-only note. When no note follows (analysis
fails, or flatten is on with images) the slot collapses, an 88px upward shift that did not exist before; a
PDF with images gets the shorter warning and shifts up by the difference. Reserve per outcome, or move the
note out of the flow above the options, and guard it with an image-bearing fixture.

- 2026-10-15 (second pass): The first fix reserved the text-only note's height, so any other outcome moved the
  options (image PDFs: the shorter warning, 460 -> 428; flatten on with images: 460 -> 428 -> 370). Fix: the
  slot is now one grid cell (`.note-slot`) holding every note variant stacked and hidden (`.note-reserve`),
  with the live note in the same cell, so the height is the tallest variant whichever note arrives or goes
  away; `analysisPending` is gone. Copy unchanged. Guard: `src/tools/compress/e2e/compress-note-no-shift.spec.js`
  samples the options' top edge per frame for num-1.pdf (text only), mixed.pdf and scan.pdf (images), on
  load and on switching flatten on. Red before: 4/6 failed (tops [460, 428] and [460, 428, 370]); green after:
  6/6, with the compress e2e folder and the hero spec 68/68. Not guarded: a failed read (no note, same slot).

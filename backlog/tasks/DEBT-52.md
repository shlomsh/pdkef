---
id: "DEBT-52"
title: "Compress's options grow 88px after a handed-over file loads"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "next"
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

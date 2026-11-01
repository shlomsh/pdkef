---
id: "READ-01"
title: "Highlight PDF: the sketches, turned into hard requirements for the real tool"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 1
depends_on: []
needs: "Your OK on the requirements below and your answers to the open calls"
---

# READ-01 · From sketches to hard requirements

*Filed 2026-11-01, rewritten the same day once the sketches had done their job.* Design record:
[docs/highlight-pdf.md](../../docs/highlight-pdf.md). The sketches are live, with every round kept, at
https://claude.ai/artifact/1ZnafnXaU9mPfXfAVey2mb ("Open the reading room"). They ran on a throwaway
harness outside `src/`, so the real tool is built from this list, not from the sketch code.

Each requirement is Shlomi's decision unless it says otherwise. The numbers in brackets are what the
sketch used and felt right; the real tool starts from them and may tune them, never drop the behaviour.

## Outcome

Every requirement below is agreed, the open calls are answered, and READ-03, READ-05 and READ-07 build
against this list.

## Requirements

### The marker (R1 to R9)

1. **One marker in the hand.** The tool opens with a yellow marker armed. Dragging along text lays a band;
   when the stroke ends nothing appears, and the reader keeps reading and marking. This replaces "a popup
   at the end of every band" and "no tool armed" in the first design.
2. **Rest to change a highlight.** Resting the pointer on a highlight opens its toolbar: Highlight or
   Underline (one segmented pair), Comment, Delete. A rest counts only after the pointer has left the spot
   where the stroke ended (12 px) and then stays still (under 3 px for 700 ms), so a resting hand never
   triggers it.
3. **Colors one step later.** Resting on Highlight opens the six colors after a longer, intent-sized pause
   (450 ms), so a quick pass toward Comment never opens them.
4. **Custom color and opacity one more step down**, behind "+" at the end of the color row: a color input
   and an opacity slider (30 to 100%). This overturns the first design's "no opacity, no color picker".
5. **Every change re-arms the marker.** Whatever color, underline or opacity the reader picks on a highlight
   becomes the marker for the next stroke.
6. **Going back works.** Any existing highlight can be rested on and changed: color, underline, a comment,
   or deleted.
7. **Touch has no hover.** On touch, a tap on a highlight opens its toolbar.
8. **A one-time hint** after the first mark: "Rest on a highlight to change it" ("Tap ..." on touch),
   placed at the end of the ink, never covering the line being read, gone after a few seconds.
9. **Keys:** 1 to 6 colors, U underline, C comment, Delete, Esc closes one layer at a time.

### Clicking and the cursor (R10 to R14)

10. **Double-click marks the word, a third click its sentence**, as text selection works everywhere. On a
    scanned page a third click takes the line (a scan has no sentences without OCR).
11. **The click count is the browser's own** (`click.detail`), never a timer of ours, so it follows the
    reader's system double-click speed. A home-made 450 ms window failed Shlomi's real triple-click.
12. **A press that drifted is still a click.** A trackpad press that moves a few pixels may start ink; a
    double-click replaces that ink, it never adds a second mark. Double-clicking an existing highlight never
    removes it.
13. **A clicked mark sweeps in from its first letter**, in reading direction (right to left on Hebrew), line
    by line for a sentence (110 to 320 ms a line), and not at all under reduced motion.
14. **The cursor is the pen in the hand.** Over the page the cursor is a small highlighter (24 px) leaning
    right, its tip in the armed color: a chisel tip for highlighting, a fine tip for underlining. The hotspot
    is the tip. Shlomi picked it over an I-beam with a color chip.

### Fullscreen: the capsule (R15 to R19)

15. **A floating capsule, not a bar.** It gives the page the whole screen. Contents in order: file name,
    page counter (a page-jump menu), zoom, the marker, Undo, Redo, Print, Download, More (Feedback,
    Replace), Exit. Undo and Redo also on Cmd/Ctrl+Z.
16. **Quiet at rest.** Grey and faded (45%), never pulling the eye while the reader reads.
17. **It wakes when reached for**, on hover or keyboard focus or while one of its menus is open, softly
    (260 ms), and stays awake while the reader looks at it.
18. **It dozes when the reader goes back to reading**, not on a timer: on a scroll of more than about
    24 px, or a press on the page, it fades slowly (1.4 s, ease in and out). Shlomi found the first fade
    "an attention stealer".
19. **The marker button shows the armed marker** (its color, or the underline glyph), so the reader always
    knows what the next stroke lays, and opens the same colors.

### Zoom (R20 to R26)

20. **Opens fitted to the width**, and the page is centered on the screen at every zoom.
21. **Fit text**, the one a student reading a paper wants most: the paper's empty side margins are trimmed
    away so the text column fills the width. The real tool takes the text bounds from the text layer, or
    from the page raster on a scan.
22. **Fit page and Actual size**, and minus and plus steps, in one small menu under the zoom percentage.
23. **Pinch and Cmd/Ctrl plus or minus zoom around the pointer**, Cmd/Ctrl+0 to actual size. During the
    gesture the document scales as a transform; it is laid out once when the fingers rest (the gesture rule
    in CLAUDE.md).
24. **Pages never reflow.** A zoomed page grows and scrolls sideways when wider than the screen; it is never
    squeezed into the column.
25. **The zoom is remembered per document**, the mode (fit width, fit text, fit page) or the percentage.
26. **A short readout** under the capsule while zooming ("Fit text · 173%"), fading on its own; it never
    wakes the capsule.

### Comments (R27 to R29)

27. **A comment belongs to a highlight**, nothing else (first design, unchanged). Sign keeps comment on
    everything.
28. **Nothing moves the page but the reader.** Opening, writing or closing a comment never shifts, re-fits or
    re-zooms the page. Measured in the sketch: reserving a rail when the first comment opened threw the page
    268 px sideways and slid it back over 600 ms while the reader started typing.
29. **Comments travel with their passages.** Anything anchored to the page (marks, note markers, open
    cards) moves with it in the same frame during scroll, pinch and zoom. Measured in the sketch: a card in a
    separate rail drifted up to 157 px from its passage during a pinch, then snapped back.

How comments are placed is open call 2.

### Scanned and multi-column pages (R30 to R33)

30. **Every gesture works on a scanned page:** drag, double-click (the word between ink gaps), triple-click
    (the line).
31. **A stroke stays in its column.** A drag that wanders into the next column ends at the line end of the
    column it started in.
32. **One detection mechanism.** Text rows, word gaps and columns are read by the same mechanism Sign uses
    for form fields: pure detectors behind one contract, swappable strategies, corpus and KPIs. Not a
    parallel reader. A future OCR model plugs in once and serves both. (Shlomi, 2026-11-01. The SIGN-46
    reader is a day-old experiment and is reshaped freely.)
33. **It holds on real scans.** The sketch ran SIGN-46's reader on a realistic two-column scan, and it
    failed three ways, each fixed in the sketch's copy only:
    - One dust pixel in a gutter column hid the gutter (`columnSpanAt` allows zero ink pixels on a short
      window), so bands crossed both columns. Fix: a gutter column may hold a couple of stray pixels.
    - A heading spanning both columns within three lines of the press hid the gutter. Fix: look for the
      gutter only around the pressed line.
    - A speck in the margin became a row's start or end, so a band began at the page edge. Fix: drop a thin
      ink island more than about a row height from the rest of the row.

    Each becomes a corpus fixture and a scored KPI, not only a unit test.

### One page layout, read once (R34 to R38)

From the 2026-11-01 read of origin/main. Today the highlight reader and field detection share one function
(`otsuThreshold`); the rest runs in parallel. `textRows.ts` redoes gray, Otsu and binarising that
`rasterInk.js` already has, highlight has no deskew and no denoising, and its thresholds are in pixels
where `rasterInk.js` keeps every threshold in points or a fraction of the image. The fixes in R33 are
symptoms of reading a three-line strip instead of a page.

34. **A page layout is read once per page and shared.** One pure layer turns a page raster (and the text
    runs when there are any) into a `PageLayout`: skew, letter height, ink rules and boxes, words, rows
    (their column, direction, and whether they span columns) and columns. Layout strategies sit behind one
    contract and a declared order, the same pattern as field sources: `rasterInk` (today's prep and
    rule finding, the FORM-07 path), `rasterRows` (rows and columns from the raster), `textLayerRows` (rows
    from the PDF's text, exact on digital papers), and later `ocrWords`.
35. **Every reader takes the layout.** Highlight bands ask the cached layout for the rows at a point; field
    detection gets `layout` in its context, additively, the way `textRuns` arrives; SNG-09's snap reads
    baselines from it. No consumer keeps its own row or column finder.
36. **OCR plugs in once, as a word source** in the `PageTextRun` shape fields already read. It informs
    columns, direction and word gaps; ink still sets a band's height. It is lazy and opt-in (FORM-32 measured
    0.3 to 4.4 s a page on a laptop, never on a phone), and highlighting works fully before it exists.
37. **The three R33 failures are fixed in the layout, page-wide:** specks well below the letter height are
    dropped before anything is projected; a gutter is a vote across the rows of a zone, so a heading that
    spans columns becomes a spanning row and the columns split around it; a row's ends come from its first
    and last surviving letters, never the first inked pixel.
38. **The layout has its own corpus beside `corpus/snap/`:** digital multi-column papers whose truth comes
    from their text, degraded with the snap corpus's seeded levels (clean, scan, fax, phone), plus pinned
    rows for gutter dust, a spanning heading, a margin speck, a drop cap and a pull quote, and Hebrew and
    three-column pages. Scored on row F1, cross-column merges, edge error, word-gap F1, column count and
    gutter position, reading order, skew, and the reader's own KPI: seeded swipes scored correct, wrong or
    declined, with a confidence bound, per degradation level. Ratcheted like `baselines.json`, and the
    field baselines are re-scored when fields start reading the layout.

**Where it lives.** The layout and raster code moves out of `src/tools/sign/` to a shared home (for
example `src/lib/pageLayout/`) before Highlight PDF imports it: `lib/highlight` already imports
`tools/sign/lib/fields/rasterInk.js`, which READ-02's own boundary line forbids. Both modules join
`DETECTION_MODULES` in the purity guard.

**Order, test first:** export the prep from `rasterInk.js` and use it in `textRows` (no behaviour change);
move the code to its shared home with READ-02; build the corpus and score today's reader with the three
failures as known-gap rows; add the contract and the page-level `rasterRows`; switch the swipe reader to
the cached page layout (riskiest: about 3.9 Mpx a page, never timed at page scale, thresholds tuned for a
strip, so it sits behind the windowed path until the swipe KPI and a real iPhone agree); then fields, snap,
and OCR.

## Learnings from building the sketches

- **Measure jank before blaming speed.** A zoom commit cost 3 to 4 ms; every "laggy" feeling was
  choreography (things outside the zoomed layer, layout shifts nobody asked for).
- **Band rectangles come from text nodes only.** Measuring a wholly selected element added its full block
  box, so a heading's band ran the width of the page.
- **The ink being laid must not catch the pointer** (`pointer-events: none` while inking), or the caret
  lookup hits the band and the ink balloons.
- **CSS `zoom` on the page column needs `justify-content: safe center`**, or a page wider than the screen
  overflows to the left where it cannot be scrolled to.
- **A capsule's glass lives on its own layer.** Opacity or a filter on the element carrying
  `backdrop-filter` drops the blur.
- **A test harness must send real click counts.** Playwright's separate `mouse.down()` calls report a click
  count of 1 each, so multi-click tests need `clickCount`.
- **Realistic scans are the test.** A clean rendered page passed everything; skew, paper grain, dust and a
  spanning heading found all three reader failures.

## Open calls (Shlomi)

1. **The name.** "Highlight PDF" (recommended) or "PDF Highlighter".
2. **Comment placement** (recommended, sketch to follow): each comment is a small marker in the page margin
   beside its passage, inside the page so it zooms and pinches with it. It opens as a card next to the
   passage: in the free space beside the page when there is room (Fit page, Actual size on a wide screen),
   otherwise floating over the page margin without covering the passage's line. The page never makes room
   for comments. This replaces the first design's rail beside the page.
3. **Touch targets.** The sketch's popup buttons are 28 px; a phone wants 44 px. Recommended: 44 px on a
   coarse pointer, 28 to 32 px on a fine one.
4. **Esc** takes up to three presses (custom panel, colors, toolbar). Recommended: keep, one layer each.

## Acceptance

- [x] Sketches built outside `src/` (a scratchpad harness), published as a private artifact.
- [x] Checked in a real browser at 980, 1280 and 1440 px wide, English, Hebrew and a scanned two-column
  page.
- [ ] Shlomi agrees the requirements and answers the open calls.
- [ ] The design record says the same as this list (no older rule left standing).
- [ ] READ-03, READ-05 and READ-07 point here for their behaviour.

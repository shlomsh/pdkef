---
id: "READ-01"
title: "Highlight PDF: the sketches, turned into hard requirements for the real tool"
status: "done"
priority: "P2"
epic: "highlight-pdf"
depends_on: []
---

# READ-01 · The Highlight PDF contract

*Filed 2026-11-01, done the same day, revised 2026-11-02 for touch, the pen's panel and full screen.* Design
record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md). The sketches that settled the numbers are
live, with every round kept, at https://claude.ai/artifact/1ZnafnXaU9mPfXfAVey2mb ("Open the reading
room"); they ran on a throwaway harness outside `src/`, so the real tool is built from this list.

## Outcome

This list is the definition of done for Highlight PDF. Each requirement is one testable statement, and
READ-03, READ-05 and READ-07 build against it. The numbers in brackets are what the sketches settled on;
the tool may tune them and never drops the behaviour. "Touch" means a coarse pointer, "desktop" a fine one.
Requirement numbers are stable: other tickets cite them. A requirement that no longer holds is marked
retired and points at its replacement; new ones are added at the end of the list in the group they belong to.
The reasons and the rejected alternatives are in "Decisions and why" at the end.

## Requirements

### Marking and arming (R1, R5, R6, R8, R9, R50 to R55, R62)

1. A file opens with the marker armed on every device: dragging (or swiping, R52) along text lays a band,
   and nothing appears when the stroke ends. It stays armed after each mark until Marker is clicked again
   (R50).
5. Every change made on a highlight (colour, Highlight or Underline, opacity, thickness) becomes the pen for
   the next marks. On touch this is the only way to change the pen.
6. Any existing highlight can be changed (colour, underline, comment) or deleted.
8. After the first mark a once-only hint appears at the end of the ink, never over the line being read, and
   fades after a few seconds: "Click a highlight to change it" on desktop, "Tap a highlight to change it"
   on touch.
9. Keys: 1 to 6 pick a colour, U toggles underline, P toggles pencil (READ-14), C comments, Delete deletes, and Esc closes one layer at a
   time (an open menu or caret first, then the toolbar or the picked mark).
50. On every device a file opens with the marker armed. A click or tap on Marker disarms it and another
    arms it, and opens nothing. Unlike Sign's one-shot tools it stays armed after each mark. Disarmed, the
    page lays no ink and shows the ordinary cursor; a highlight can still be picked. There is no Stop button
    and no bar at the foot of the screen.
51. On touch, while armed, the hint "Swipe to highlight", preceded by the pen's look (a dot in its colour at
    its opacity, or the underline glyph), sits beside the file name on one line in the toolbar card's
    identity row, after a hairline; the name ellipsises first, and the row's height never changes. In full
    screen there is no hint; the capsule's Marker shows the armed state (R19).
52. On touch, while armed, one finger marks only when it starts on a line of text and moves sideways: the
    first 10 px of travel decide, sideways at least twice the vertical lays a mark and anything else is a
    native scroll. A finger that starts off the text (a margin, a gap between paragraphs) moves the page in
    any direction and never marks. "On a line" allows half a line's height above and below it and about a
    line's height before and after it. A mark that started sideways may run down several lines. Mouse and
    pen start a mark after 4 px in any direction. A finished mark opens nothing.
62. On touch, two fingers always navigate: they pinch to zoom and move the page in any direction, and never
    mark. A second finger landing while a one-finger mark is deciding or under way cancels that mark,
    leaving no trace and no Undo step. Outside full screen the pinch is the browser's own; zoomed in, one
    finger sideways on a line still marks (R52) and from anywhere else pans the page. Full screen keeps the
    lamp's zoom (R23).
53. First-time marks start at 50% opacity; a remembered choice wins.
54. The live swipe paints at the mark's own opacity, so the ink never changes strength on release.
55. An underline follows its page's turn on screen, in the downloaded PDF (QuadPoints in the text's own
    order) and in print.

### Changing a highlight: the toolbar and the panel (R2 to R4, R7, R47 to R49)

2. On desktop a rest draws the faint outline, a click opens the panel (R47) where the click landed, centred
   on the pointer, above the line clicked, or just below it where the row and its tallest menu have no room above. A rest counts after the pointer has left the spot where the stroke
   ended (12 px) and then stays under 3 px of movement for 300 ms. Nothing else opens the panel, apart from
   keyboard focus (R39).
3. (retired: replaced by R4)
4. The panel shows the three most popular highlighter colours (yellow, pink, green) first. A "more" button
   with a chevron opens orange, red, blue and the colour wheel; when the current colour is one of those or a
   custom one, it shows that colour's dot before its chevron, pressed.
7. On touch, tapping a highlight picks it: the mark shows a ring and the context panel opens under the top
   toolbar (in full screen, under the capsule's Marker) with that mark's look, Comment and Delete. Nothing
   floats on the page. A tap elsewhere, Esc, or a tap on Marker releases the mark; tapping another mark moves
   the panel to it.
47. There is one panel, and it belongs to a picked highlight: on desktop it floats above the mark (R2), on
    touch it sits under the top toolbar (R7). It is one row: Comment, the colours (R4), one Look button, Delete.
    Look holds the kind, the stroke and the strength. The narrowest phones keep it one row and Comment keeps
    its word.
48. The opacity control, inside Look, is Redact's blur-strength slider look: a native range between a faint and a solid
    dot, with no label or readout. Opacity runs from 30% to 100%.
49. Touch targets are at least 44 px tall; the switch's two halves are at least 40 px wide each. On a fine
    pointer the panel's buttons are 28 to 36 px.

### Clicking and the cursor (R10 to R14)

10. Double-click marks the word and a third click its sentence, as text selection works everywhere. On a
    scanned page a third click takes the line.
11. The click count is the browser's own (`click.detail`), never a timer of ours.
12. A press that drifted is still a click: a trackpad press that moves a few pixels may start ink, and a
    double-click replaces that ink rather than adding a second mark. Double-clicking an existing highlight
    never removes it.
13. A clicked mark sweeps in from its first letter in reading direction (right to left on Hebrew), line by
    line for a sentence (110 to 320 ms a line), and not at all under reduced motion.
14. Over the page the cursor is a small highlighter (24 px) leaning right, its tip in the armed colour: a
    chisel tip for highlighting, a fine tip for underlining. The hotspot is the tip.

### Zoom (R20 to R26, R56, R57)

20. The page opens fitted to the width, and a column narrower than the view is centred at every zoom.
21. Fit text trims the paper's empty side margins so the text column fills the width. Text bounds come from
    the text layer, or from the page raster on a scan.
22. Fit page, Actual size and the minus and plus steps are in one small menu under the zoom percentage.
23. In full screen, pinch and Cmd/Ctrl plus or minus zoom around the pointer; Cmd/Ctrl+0 is actual size. During the gesture
    the document scales as a transform and is laid out once when the fingers rest.
24. Pages never reflow: a zoomed page grows and scrolls sideways when wider than the screen.
25. (retired: replaced by R20)
26. A short readout under the capsule while zooming ("Fit text · 173%") fades on its own and never wakes the
    capsule.
56. In full screen, sideways movement is bounded by the column (pages plus notes): a column narrower than
    the view is centred and cannot move sideways, and a wider one stops with its edge at the view's edge.
57. In full screen, zooming out stops at the whole-page fit (the widest page plus its notes column), for
    pinch, trackpad pinch, the zoom menu and a zoom set earlier.

### Full screen: the capsule (R15 to R19, R58)

15. A floating capsule replaces the bar and gives the page the whole screen. In order: file name, page
    counter (a page-jump menu), zoom, Marker, Undo, Redo, Print, Download, More (Feedback, Replace), Exit.
    Undo and Redo also answer Cmd/Ctrl+Z.
16. At rest the capsule is grey and faded (45%).
17. It wakes softly (260 ms) on hover, keyboard focus or while one of its menus is open, and stays awake while
    the reader looks at it.
18. It dozes, not on a timer, when the reader goes back to reading: a scroll of more than about 24 px or a
    press on the page fades it slowly (1.4 s, ease in and out).
19. The Marker button shows the pen (its colour, the underline glyph, or the pencil's hatching). A click arms and disarms the
    marker (R50) and opens nothing; on touch a picked highlight's panel opens under it (R7).
58. The capsule's page field uses a 16 px font on touch (no iOS focus zoom), the capsule is
    `touch-action: manipulation` (no double-tap zoom), and opening one capsule menu closes the other.

### Comments (R27 to R29, R60)

27. A comment belongs to a highlight and nothing else. Sign keeps comment on everything.
28. The page and its notes fit together, as in Google Docs. With no notes, fitting fits the page alone; once a
    document has a note, Fit width and Fit text fit the page plus a notes column beside it, and saved notes
    show in that column beside their passages. The first note makes room at once, when its card opens: the
    page keeps its left edge and shrinks in one layout with no slide, and the commented passage stays on the
    same line of the screen. The last note gives the room back the same way. Nothing else about a note moves
    the page.
29. Anything anchored to the page (marks, note markers, open cards) moves with it in the same frame during
    scroll, pinch and zoom.
60. A click on the active comment card edits it.

### Saving (R59, R61)

59. Download shows "Saved as {name}." in the shared done strip under the toolbar, and the strip hides when
    the document changes.
61. A reload, a browser crash or coming back to the tool reopens the last document with all its marks and
    notes, from the shared on-device store, on https and on a plain-http page alike.

### Scanned and multi-column pages (R30 to R33)

30. Every gesture works on a scanned page: drag, double-click (the word between ink gaps) and triple-click
    (the line).
31. A stroke stays in its column: a drag that wanders into the next column ends at the line end of the column
    it started in.
32. Text rows, word gaps and columns are read by the same mechanism Sign uses for form fields: pure
    detectors behind one contract, swappable strategies, a corpus and KPIs. A future OCR model plugs in once
    and serves both.
33. The reader holds on realistic scans: a stray pixel in a gutter, a heading that spans both columns near
    the press, and a speck in the margin each leave the band correct. Each is a corpus fixture and a scored
    KPI, not only a unit test.

### One page layout, read once (R34 to R38)

34. A page layout is read once per page and shared. One pure layer in `src/lib/pageLayout/` turns a page
    raster (and the text runs when there are any) into a `PageLayout`: skew, letter height, ink rules and
    boxes, words, rows (their column, direction, and whether they span columns) and columns. Strategies sit
    behind one contract and a declared order: `rasterInk`, `rasterRows`, `textLayerRows` (exact on digital
    papers), and later `ocrWords`. The modules are in the purity guard's `DETECTION_MODULES`.
35. Every reader takes the layout. Highlight bands and Sign's passage comments ask the cached layout for the
    rows at a point, field detection gets `layout` in its context, and snapping reads baselines from it.
    No consumer keeps its own row or column finder.
36. OCR plugs in once, as a word source in the `PageTextRun` shape fields already read. It informs columns,
    direction and word gaps while ink still sets a band's height. It is lazy and opt-in, and highlighting
    works fully without it.
37. The layout fixes the three scan failures page-wide: specks well below the letter height are dropped
    before anything is projected; a gutter is a vote across the rows of a zone, so a spanning heading
    becomes a spanning row and the columns split around it; a row's ends come from its first and last
    surviving letters, never the first inked pixel.
38. The layout has its own corpus beside `corpus/snap/`: digital multi-column papers whose truth comes from
    their text, degraded with the snap corpus's seeded levels (clean, scan, fax, phone), plus pinned rows
    for gutter dust, a spanning heading, a margin speck, a drop cap and a pull quote, and Hebrew and
    three-column pages. It is scored on row F1, cross-column merges, edge error, word-gap F1, column count
    and gutter position, reading order, skew, and the reader's own KPI (seeded swipes scored correct, wrong
    or declined, with a confidence bound, per degradation level), and ratcheted like `baselines.json`.

### Shared with Sign, in the PDF standard (R44 to R46)

44. Highlighting leaves Sign and comments stay. Sign keeps comment on a passage, on an element and the pin
    (`docs/sign-comments-model.md`), and keeps showing, exporting and deleting highlights it can no longer
    make (READ-04).
45. Both tools write and read the same standard annotations, nothing PDkef-specific: a highlight is a
    `/Highlight` in its colour; a comment on it adds `/Contents`, `/M` and a closed `/Popup`; Sign's passage
    comment is a transparent `/Highlight` and its pin a `/Text` note. One shared codec does the export and
    read-back, so a file marked in one tool opens in the other and in Acrobat Reader, macOS Preview and
    Chrome's viewer, with every highlight and comment showing.
46. Sign's passage comment and Highlight PDF's highlight lay the same band through the same code (swipe
    gesture, band geometry, line reading), reading their rows from the shared page layout (R34 to R38), so
    a scanned page works for both.

### Accessibility and the phone (R39 to R43)

39. Every highlight is reachable without a pointer: Tab reaches the page, arrow keys move between marks in
    reading order, and a focused mark opens its toolbar as a rest does (R2). On a digital PDF, a keyboard
    text selection plus H highlights it.
40. Marks and note markers meet 3:1 against the page (WCAG 1.4.11): a pin or dot draws a deep amber glyph
    on an amber wash (6.1:1), and every focusable one shows a focus ring (on a mark, the pencil outline of
    READ-13). The capsule may sit below 3:1 only while dozing, and the other marks may sit at about 55% while a
    note is open or a mark is picked.
41. Opening a note puts the caret in it; Esc, Save or a press elsewhere returns focus to the pin or dot that
    opened it, never to the page body. The note is a labelled group naming its passage.
42. At 375 px the capsule fits the screen: it keeps page, zoom, Marker, Undo and Exit at 44 px and moves the
    rest into More (READ-05).
43. The pages are the page's main landmark, labelled with the file name; the capsule stays a toolbar.

## Open from the 2026-11-02 reviews

Found by two zero-context reviews (`1e729ad1..1db48f20`, then `1e729ad1..36f5a564`); each is checked against
the contract before READ-01 closes. Fixed since: the unclamped live pan (`94f8b17d`), the hidden tile row's
second panel in full screen, the digest recomputed on every autosave (now once per file), and R49's 36 px switch
halves with the row wrapping at 402 px (the colors became one framed choice and the row fits, 2026-11-02), and the
finger swipe that did nothing when it started on a highlight (a marked line is a line of text: sideways lays a band, R52), and the capsule's one
`menuOpen` flag (it now tracks each open menu, so the zoom menu closing never dozes it under an open Marker panel), and the lamp's padding read on every render
(now measured with the view), and the touch panel without keys on an iPad keyboard (it answers 1 to 6, U, C and
Delete as the toolbar does, a keyboard focus on a mark opens it, and the number keys follow the panel's color
order), and More's open state held twice (MarkPanel is controlled, `d930652d`), and the canvas read twice per touch
press (one reader per press, `d930652d`), and the normal view without a pinch (it is the browser's own now, R62).
- A pinch that lands after the first finger began a native scroll cannot cancel that scroll (touchmove is no
  longer cancelable), so the page may scroll and scale at once.
- On a plain-http page the SHA-256 fallback is synchronous: a very large PDF blocks the main thread for about a
  second per 50 MB, once per file.

## Decisions and why

Shlomi's calls, with the reason, newest group first.

2026-11-02, touch and the panel
- The colors are one choice, drawn like the switch beside them: one framed track holds yellow, pink, green and More,
  the picked color sits on a soft tint inset 3 px, and the switch's picked half uses the same fill instead of a solid
  block. Both are radio groups with arrow keys; Home and End stay with the desktop toolbar, which treats each group as
  one stop. Chosen from three sketches (a fill in the color's own tint and an unframed row were the others).
- Superseded for the color cells the same day ("Ink swipe", picked from the design board): each cell draws a
  highlighter in its own color, and the picked one is a band of its ink swiped in behind the marker, with no tint
  fill. The marker shades are document colors in the model (`lib/marker/markerShades.ts`); custom inks derive
  theirs from the same rule. The switch keeps the tint. Sign's round swatches are unchanged.
- R49 at 402 px: on touch the row drops its 1 px gaps and the divider before Comment, colors are 30 px wide, More 28,
  the switch halves 40, and the percent keeps room for "100%" so the row never changes width. READ-14 briefly gave the switch
  a third segment (Pencil, 28 px segments); Pencil moved into the opacity popover the same day, the halves are 40 again, and
  the row is still one line from 393 px up (and measured one line at 375 px on 2026-11-02).
- Touch arms on a tap and disarms on a tap, with no Stop button: it is how Sign's tool buttons already work.
- Touch has no hover, so a tap picks a highlight and its panel opens under the toolbar; nothing floats on the
  page, which keeps the lines being read free.
- Rejected on touch: a toolbar opening on every new mark (too dominant, covers the next lines, blocks the
  next swipe); a pen bar at the foot of the screen (splits the look from Comment and Delete into two
  places); a Stop strip under the toolbar (a second control for what Marker already does); arming opening
  the panel (the panel is the context of a picked highlight only).
- On touch, changing a picked highlight is the only way to change the pen (R5), confirmed.
- A file opens armed on touch (R50): the reader came to highlight, and the line-only sideways start (R52)
  keeps scrolling with a finger safe.
- One panel, only for a picked highlight, on every device (R2, R47): the Marker's pen panel on desktop was a
  second toolbar beside the mark's own, and the two looked different. The pen follows the last change (R5).
- Marker toggles on desktop too and stays armed between marks (R1, R50): one model everywhere; a one-shot
  marker, as Sign's tools are, would cost a click per line read.
- (Replaced by READ-24 on 2026-11-06: Look holds both.) The switch has no carets; one setting button sits a gap away (R47): a caret inside each half put two
  intents a finger's width apart.
- Outside full screen the pinch is the browser's (R62, 2026-11-02): "use the native capabilities as much as
  possible, modern phones are doing a good job." Our own zoom stays in full screen, where the capsule must hold
  still and R56/R57 bound the page. Zoomed in, WebKit pans with one finger whatever `touch-action` says, so a
  finger on a line claims its sideways moves through a `touchmove` listener that is in place from mount (WebKit
  reads the listeners when a touch starts; one added at the press cannot stop that touch's pan).
- Only a sideways start marks on touch: with an any-direction start, scrolling marked every line passed.
- Two fingers navigate and one finger marks only from a line of text (R52, R62): on a real iPhone a pinch
  laid marks and a zoomed page could not be moved sideways, because every sideways start marked, even in a
  blank gap. Two fingers to navigate is the drawing-app convention.
- The panel replaces rest-for-colours: three colours first, the rest behind "more", so the least common
  controls are one click away and the panel stays simple, not a cockpit.
- Opacity uses Redact's slider look, so one control means one thing across tools.
- First-time opacity is 50%: phones (iOS Safari, also the Simulator) draw the ink over the page canvas
  without the multiply blend, so full strength hides the text; desktop keeps multiply.
- Full-screen sideways bounds and the whole-page zoom floor: without them the page could be dragged off the
  screen or shrunk to a dot.
- The capsule's page field is 16 px on touch and the capsule is `touch-action: manipulation`: iOS zooms
  into smaller fields and on double-tap.
- Work survives a reload or crash on a plain-http page too (R61): a phone on the LAN dev link has no Web
  Crypto, so the store named nothing and saved nothing; a plain-JS SHA-256 gives the same ids there.

2026-11-01, tool and marker
- The name is Highlight PDF, at `/highlight-pdf/`; "PDF highlighter" is a body phrase.
- The marker is always armed on desktop and a finished band shows nothing: a popup after every band asks a
  question the reader did not have. This replaced "a popup at the end of every band".
- A rest needs 12 px of travel away from the stroke's end and 700 ms of stillness, so a resting hand never
  triggers it.
- Custom colour and opacity exist after all (the first design had neither), kept behind "more" and the
  carets so the main colours stay the vocabulary for most readers.
- Esc closes one layer at a time, so a reader never loses more than they meant to.
- The click count is the browser's `click.detail`: a home-made 450 ms window failed Shlomi's real
  triple-click.
- The cursor is a highlighter in the armed colour, picked over an I-beam with a colour chip.
- The capsule dozes when the reader goes back to reading, not on a timer: the first fade was an attention
  stealer.
- No zoom is remembered (R25, READ-04 QA): the normal view is always Fit width and full screen always opens
  at Fit width.
- Notes sit beside the page, as in Google Docs (R28). The first sketch reserved a rail and re-fitted with an
  animation that threw the page 268 px sideways for 600 ms while the reader typed; its rail also drifted up
  to 157 px from a passage during a pinch (R29). Zoomed past the fit, a note shows as a pin in the margin
  and opens over the margin under its passage; the popover sketch (a dot at the passage's end) was not taken.
- One detection mechanism: SIGN-46's reader was a day-old experiment and is reshaped, not kept beside the
  new layout.
- Highlighting leaves Sign in the same push that launches this tool, so it is never missing from the product.
- Realistic scans are the test. A clean rendered page passed everything; skew, paper grain, dust and a
  spanning heading found all three reader failures (R33). The sketch's fixes were: a gutter column may hold
  a couple of stray pixels, the gutter is looked for only around the pressed line, and a thin ink island
  more than about a row height from its row is dropped.
- The highlight reader and field detection shared only `otsuThreshold`; `textRows.ts` redid gray, Otsu and
  binarising that `rasterInk` already had, with thresholds in pixels where `rasterInk` keeps points or
  fractions. That is why R34 to R38 read the page once. The order of work was: export the prep and use it
  in `textRows`, move the code to its shared home, build the corpus with the failures as known-gap rows, add
  the contract and the page-level `rasterRows`, then switch the swipe reader to the cached layout (the
  riskiest step, about 3.9 Mpx a page, so it sits behind the windowed path until the swipe KPI and a real
  iPhone agree), then fields, snap and OCR.
- The Impeccable audit of the sketch (13 of 20) produced R39 to R43. Not taken: its "cream background"
  warning (it is PDkef's own `--color-bg` token) and a dark theme check (the product has none).
- The full-screen mode's name is Reading lamp, decided in READ-05.

Learnings from the sketches that shape the build
- Measure jank before blaming speed: a zoom commit cost 3 to 4 ms, and every "laggy" feeling was
  choreography (things outside the zoomed layer, layout shifts nobody asked for).
- Band rectangles come from text nodes only; measuring a wholly selected element added its full block box.
- The ink being laid has `pointer-events: none`, or the caret lookup hits the band and the ink balloons.
- CSS `zoom` on the page column needs `justify-content: safe center`, or a wide page overflows to the left
  where it cannot be scrolled to.
- A capsule's glass lives on its own layer: opacity or a filter on the element carrying `backdrop-filter`
  drops the blur. The editor card's glass moved to its own layer too (2026-11-02): iOS WebKit makes an element
  with `backdrop-filter` the containing block of its fixed descendants and floating-ui assumes it does not, so the
  phone's mark panel sat 16 px right of its gutters (`panel-gutters-webkit.spec.js`).
- A test harness must send real click counts: Playwright's separate `mouse.down()` calls report 1 each, so
  multi-click tests need `clickCount`.
- Read every size, then write every position: laying out notes one at a time forces a layout per note.
- A settling band animates with a transform, not `left` and `width`.
- A component's own sizing must outrank the shared popover classes on the same element (`.wrap .menu`, not `.menu`):
  a production build loads those classes last, so the touch panel wrapped on the built site and not in `astro dev`.
- A floating panel placed with `strategy: 'absolute'` sits at its anchor for one frame before it is shifted; on a
  375 px phone that frame widened the page and mobile Chrome kept the wider layout viewport. Touch panels use `fixed`.

## Acceptance

- [x] Sketches built outside `src/` (a scratchpad harness), published as a private artifact.
- [x] Checked in a real browser at 980, 1280 and 1440 px wide, English, Hebrew and a scanned two-column
  page.
- [x] Shlomi answers the name, touch target and Esc calls.
- [x] Shlomi decides comment placement (beside the page, as in Google Docs).
- [x] The name moves to READ-05 with its shortlist.
- [x] The design record says the same as this list (no older rule left standing).
- [x] READ-03, READ-05 and READ-07 point here for their behaviour.

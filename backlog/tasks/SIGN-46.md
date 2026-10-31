---
id: "SIGN-46"
title: "Sign: a highlighter that lays a straight band along the line under your finger"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# SIGN-46 · A highlighter that lays a straight band along the line under your finger

*Filed 2026-10-31.* Shlomi asked for a highlight option in Sign and picked the line band from four
sketched options, with the six classic highlighter colors. The design is
[docs/sign-highlight.md](../../docs/sign-highlight.md).

## Outcome

On a phone and on desktop, on a digital PDF and on a scanned page, a person arms Highlight, swipes
along a line of text, and gets a straight band in their chosen color covering that line; dragging down
carries it onto the following lines. The text under it stays as dark in the exported PDF as on screen.

## Acceptance

- [x] `findTextRow` is a pure function with unit tests on synthetic rasters, a Hebrew line, and the
  five corpus scans in `src/tools/sign/lib/fields/corpus/snap/pages/`, each seen failing first.
- [x] A swipe makes one `highlight` element with one band per covered line; one undo removes it.
- [x] The band's height follows the line under the press, and its ends settle on word gaps.
- [x] Six colors, yellow by default; the chosen color is remembered per document and as the app-wide
  default, and never changes the shape or text color.
- [x] A highlight survives a draft restore, moves, recolors and deletes.
- [x] The export draws each band with Multiply blending; a unit test reads the blend mode back.
- [x] One e2e on a digital sample and one on a scanned page check the band sits on the line, at a
  phone and a desktop size.
- [x] The toolbar still fits at 320px wide (`sign-toolbar-labels-fit.spec.js`).

## Done 2026-10-31

The highlighter lays a straight band on the line under a swipe, one band per covered line, in six colors with yellow first, remembered per document. The export draws the bands with Multiply. e2e `sign-highlight.spec.js` (digital, scanned and two lines, at desktop and phone with real touch) passes. With the Highlight button Sign's phone toolbar has thirteen controls: decided 2026-10-31 to keep 7+6 at every phone width and let buttons go under 44px there (40.6px at 360, about 35px at 320, every label inside its button). `sign-toolbar-labels-fit.spec.js` expects 7+6 and passes from 919px down to 239px.

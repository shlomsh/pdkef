---
id: "SIGN-46"
title: "Sign: a highlighter that lays a straight band along the line under your finger"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
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

- [ ] `findTextRow` is a pure function with unit tests on synthetic rasters, a Hebrew line, and the
  five corpus scans in `src/tools/sign/lib/fields/corpus/snap/pages/`, each seen failing first.
- [ ] A swipe makes one `highlight` element with one band per covered line; one undo removes it.
- [ ] The band's height follows the line under the press, and its ends settle on word gaps.
- [ ] Six colors, yellow by default; the chosen color is remembered per document and as the app-wide
  default, and never changes the shape or text color.
- [ ] A highlight survives a draft restore, moves, recolors and deletes.
- [ ] The export draws each band with Multiply blending; a unit test reads the blend mode back.
- [ ] One e2e on a digital sample and one on a scanned page check the band sits on the line, at a
  phone and a desktop size.
- [ ] The toolbar still fits at 320px wide (`sign-toolbar-labels-fit.spec.js`).

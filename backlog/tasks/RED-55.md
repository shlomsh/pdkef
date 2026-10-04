---
id: "RED-55"
title: "What Sign places stays one deletable thing after download"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-55 · What Sign places stays one deletable thing after download

*Found 2026-10-03 with RED-54.* Shlomi ticked a box on the 101 form in Sign, downloaded, then opened
the result in Redact to delete the tick. Sign had written the tick as two stroked line segments in an
appended content stream. Delete only offers text blocks and images, so the tick had no target at all,
and pointing at it reached the form text underneath.

Sign's export loses what was one element. Making every vector path a Delete target is not the answer:
this form draws its cell fills and table rules as paths, and they would become wide outlines over
empty space.

## Scope

- `signPdf` (`src/editor/adapters/pdf/sign.js`) wraps each element it bakes in a marked-content
  sequence: `/PDkef BMC` before its `q ... Q`, `EMC` after.
- `extractPageObjects` reports one `mark` unit per outermost `/PDkef` sequence (`BMC` or `BDC`, nesting
  counted so Sign's own `/Span ... BDC ... EMC` inside it is fine). Its bbox is the union of everything
  drawn inside: glyphs, images, and paths (`m l c v y re`, through the CTM, widened by half the line
  width). Nothing inside it is offered as a separate unit. Its span runs from the `/PDkef` operand to
  the `EMC`.
- Deleting a mark removes the whole span; an image only that mark drew is dropped from the file like
  any other undrawn image. Its hover label reads its text when it has some, and otherwise "Click to
  delete this mark".
- Files Sign saved before this change stay as they are; nothing guesses at untagged paths.
- A mark opens and closes in one stream: an `EMC` inside a Form never closes a page-level mark, a mark
  left open at its stream's end is dropped and its contents offered as usual, and a mark that draws a
  Form is not offered (deleting it could not remove the Form's content).
- Every element Sign exports (check, x, dot, signature, line, rectangle, ellipse, whiteout, Latin and
  Hebrew text) is one mark, each a test case.

## Acceptance

- Unit tests, each seen failing first: `signPdf` with a check symbol yields exactly one `mark` unit
  whose bbox covers the tick; a signature image plus a date text give one mark each, with no separate
  text or image unit; deleting the tick mark removes its path operators and leaves the page's own
  content byte-identical.
- `check:fast` green.

## Result

`signPdf` wraps every element in `/PDkef BMC ... EMC`, and Delete offers each such sequence as one
`mark` target (its text reads in the hover label, the undo chip says "Deleted a mark", the saved-file
check looks for its text). Every exported element type is a test case (check, x, dot, signature, line,
rectangle, ellipse, whiteout, Latin and Hebrew text); with the tag removed all of them fail. Deleting a
mark gives back the page as it was before signing and drops an image only it drew. A mark opens and
closes in one stream, one left open is dropped and its contents offered as usual, and one that draws
a Form is not offered.

---
id: "RED-52"
title: "Arrow keys move a whiteout or blackout box on a document with no blur"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-52 · Arrow keys move a whiteout or blackout box on a document with no blur

*Found 2026-10-01 while verifying RED-51 in WebKit at 390px.* A focused, selected whiteout box kept the
same `top` after Shift+ArrowDown. RED-43's arrow keys move a box by page points, so `boxMovePatch`
(`boxKeys.ts`) needs the page's size and returns nothing without it. `PdfRedactTool.tsx` read page sizes
(`usePageSizesPt`) only once a blur box or a blur stroke existed or a brush was armed, so on a document
with only whiteout or blackout boxes every Arrow and Shift+Arrow press did nothing. Whiteout strokes were
left out the same way: with no blur around, a restored whiteout stroke drew its brush for a Letter page
(`renderStrokeSurface`'s fallback) rather than its own page.

## Acceptance
- On a document with no blur, ArrowDown on a selected whiteout box and on a selected blackout box moves
  it by one point, and one Undo puts it back. Tested in the island (`PdfRedactTool.test.tsx`), where the
  RED-43 unit tests could not see it: they hand `RedactBox` its page size directly.
- Every box and stroke, or an armed brush, reads the page sizes; a document with nothing drawn (delete
  marks don't count) still reads none. One named rule, unit-tested.

## Result

`needsPageSizes(elements, brushArmed)` in `usePageSizesPt.ts` is now the one rule for when the island reads
page sizes: any box or stroke, or an armed brush. Delete marks and an empty document read nothing. Arrow and
Shift+Arrow move a whiteout or blackout box on a document with no blur, and one Undo puts it back; a
restored whiteout stroke draws its brush for its own page rather than a Letter page. The island test draws
each box with no blur anywhere and goes red on the old rule; the rule itself has a unit test. The sizes are
published once, after the last page is read, so on a very long document the keys wait for that read, as a
blur box's always did.

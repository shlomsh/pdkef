---
id: "RED-52"
title: "Arrow keys move a whiteout or blackout box on a document with no blur"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-52 · Arrow keys move a whiteout or blackout box on a document with no blur

*Found 2026-10-01 while verifying RED-51 in WebKit at 390px.* A focused, selected whiteout box kept the
same `top` after Shift+ArrowDown. RED-43's arrow keys move a box by page points, so `boxMovePatch`
(`boxKeys.ts`) needs the page's size and returns nothing without it. `PdfRedactTool.tsx` read page sizes
(`usePageSizesPt`) only once a blur box or stroke existed or a brush was armed, so on a document with only
whiteout or blackout boxes every Arrow and Shift+Arrow press did nothing.

## Acceptance
- On a document with no blur, ArrowDown on a selected whiteout box and on a selected blackout box moves
  it by one point, and one Undo puts it back. Tested in the island (`PdfRedactTool.test.tsx`), where the
  RED-43 unit tests could not see it: they hand `RedactBox` its page size directly.
- A document with no boxes still reads no page sizes.

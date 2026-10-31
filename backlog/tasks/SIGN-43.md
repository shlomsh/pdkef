---
id: "SIGN-43"
title: "Sign: turn a sideways page a quarter turn, next to Clear page"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# SIGN-43 · Turn a sideways page a quarter turn, next to Clear page

*Filed 2026-10-31.* Shlomi: a document can mix pages scanned upright and sideways, and filling a
sideways page means turning it. He wants a simple way to rotate a page, next to the Clear page button.

## Design

- **One button per page, Rotate**, beside Clear page in the page's header row, in both Sign modes. Each
  press turns that page a quarter turn clockwise; four presses bring it back. It shows on every page,
  empty or not.
- **A turn is document state**, `pageTurns` (clockwise quarter turns by page index, on top of the page's
  own /Rotate). It is saved with the draft, is one undo step, and marks the document changed.
- **Everything follows the content.** Elements are stored in percent of the displayed page, so a turn
  maps each element on that page. Marks that cover content (rectangle, ellipse, whiteout, line, and the
  highlight from SIGN-46) turn with it. Marks written on the page (text, signature, symbol, date) stay
  upright and keep their size in points, and their anchor follows the content. Detected fields are
  mapped the same way, so fill mode's hops and hints stay on their fields.
- **The export turns the page too**, by adding the turn to the page's /Rotate (`applyRotation` in
  `src/lib/pages/pageOps.js`) before the elements are drawn, so the file opens the way the person saw it.
- The pure geometry is `src/editor/geometry/pageTurn.ts`. The displayed geometry is derived once in
  `PdfWorkspace.tsx` from the measured page sizes and `pageTurns`; nothing else re-derives it.

## Acceptance

- [x] `pageTurn.ts` is pure and unit-tested: four turns are the identity for points, boxes and every
  element type, a covering box swaps width and height, an upright mark keeps its size in points.
- [x] Pressing Rotate turns the page on screen and every element on it stays on the same content.
- [x] Undo turns it back; a draft restore brings the page back turned.
- [x] The exported PDF opens with the page turned and the elements where they were on screen
  (a unit test on `signPdf`, and one e2e).
- [x] Fill mode's hops and field hints follow a turned page.
- [x] Redact's page header is unchanged.

## Done 2026-10-31

Rotate turns one page a quarter turn on screen and in the export, and every mark stays on its content. A fresh review's seven findings are fixed: field hops and hints read the same turned regions as the workspace (`useDocumentFields`), a page that is only turned counts as something to export, a turn closes an open fill slot, Rotate waits for the page's measured size, and turn history is validated. Upright text turns by its line box and, on a half turn, by its measured width, so text typed on a field stays on that field. e2e `sign-rotate-page.spec.js` (turn, undo, restore, export) passes in Chromium and desktop WebKit; Redact's header check moved to `redact-page-header-no-rotate.spec.js`. Checked at 390px with touch in Hebrew: the page turns and a comment badge stays upright.

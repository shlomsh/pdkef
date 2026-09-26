---
id: "SIGN-36"
title: "Every text box can be aligned, and the download matches what the screen shows"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-35"]
---

# SIGN-36 · Every text box can be aligned, and the download matches what the screen shows

*Filed 2026-09-26.* Shlomi: "every text box should have an alignment control, why isnt it the way?"

## Why it was not

The control came in with 9e7a6e26 for boxes that span a detected form field only. That change assumed a
free box hugs its text, so alignment has nothing to show. That holds for one line but not for several:
the lines of a multi-line box sit left, centred or right within the widest one.

## The bug under it

Since SIGN-33 a free box takes the document's carried alignment, and since SIGN-35 the app-wide one.
The screen applies it (TextNode's textarea `text-align`, through `getTextAlign`), but the export does
not: `textPdf.ts` starts every line of a free box at its anchor edge. Centred or right-aligned lines on
screen download left-aligned (or, for RTL, right-aligned). That breaks the invariant that the export
matches the screen.

## The change

- `ElementToolbar` shows the alignment control on every text box except a comb, which places one
  character per cell.
- `textPdf.ts` aligns a free box's lines within its widest line, exactly as the textarea does: left,
  centred or right. The box keeps its anchor (an LTR box's left edge, an RTL box's right edge), and with
  no chosen alignment it keeps today's layout.

## Acceptance

- [ ] Unit tests: the control shows on a free box and on a field box, but not on a comb. A free box's
  exported lines sit left, centred and right within the widest line, for LTR and RTL.
- [ ] The A/B/A e2e chooses an alignment on a free box in document B, and B keeps it after a reload.
- [ ] Checked in a real browser: a multi-line free box, centred, looks the same on screen and in the
  download, at desktop and phone width.

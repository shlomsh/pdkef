---
id: "MERGE-21"
title: "A long output name with no break points runs past the card on a phone"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# MERGE-21 · A long output name with no break points runs past the card on a phone

*Filed 2026-10-12* from an iPhone (Safari, about 390px wide). Two PDFs with long names that have
no natural break points, such as `Statement_20260730163241_123456789_AccountSummary.pdf`: the output-name
heading (`merged_<first file name>`, the editable heading of docs/ux-design-guidelines.md heading 5)
draws on one line and runs past the right edge of the white card, so the page scrolls sideways.
The ".pdf · N pages" line under it and the file chips above it are fine.

Below 768px `MergeDocument.module.css` already lets `.name` wrap (`white-space: normal`), but an
underscore is not a line-break opportunity, so a name made of digits, letters and underscores has
nowhere to break and overflows its box. The heading is Merge's own; no other tool shares it.

## Done when

- A Playwright guard in `src/tools/merge/e2e/` at 390px loads two PDFs with a long
  underscore-joined name and asserts the heading's right edge stays inside the card and the
  document has no horizontal overflow; seen red before the fix, green after.
- The name wraps inside the card on a phone. Inline rename, ".pdf", the page count and the pencil
  keep working, and a normal-length name looks exactly as before.

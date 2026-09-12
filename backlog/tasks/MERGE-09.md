---
id: "MERGE-09"
title: "Page-level editing: rotate, skip and reorder pages across files, all free"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-08"]
legacy_state: "Open"
---

# MERGE-09 · Page-level editing: rotate, skip and reorder pages across files, all free

*Filed 2026-09-13* from the Merge review; the three page operations were Shlomi's explicit ask.

## Scope and acceptance

The page strip from MERGE-08 becomes editable. Three operations on any page, from any file:

- **Rotate** by 90 degrees, additive on the page's existing rotation, exactly as `editPages.js` does.
- **Skip**: mark a page so it is left out of the export. It stays visible, dimmed with a struck
  number, so the person can see what they removed and bring it back with one tap. Nothing is deleted
  from the source file.
- **Reorder across files**: drag a page anywhere in the strip, including between pages of another
  file. The strip stops grouping by file the moment a page crosses a boundary; the file list above
  then shows a "pages rearranged" note and reverts to a flat order.

Each is a gesture that commits once on drop or tap, through SortableJS as the file list already does;
no store, no per-frame state (the gesture rule in `editor.md`, list form).

**Library.** `mergePdfs` gains a page map: an ordered list of `{ fileIndex, pageIndex, rotation }`
entries, defaulting to "every page of every file in file order". `editPages.js` has the rotation and
removal logic; extract the shared part into one helper rather than copying it. Page numbers, when
on, count output pages.

**Acceptance.**

- Rotating, skipping and moving pages is reflected in the exported PDF exactly as shown in the strip;
  a fixture set with the three operations applied round-trips in `merge.test.js`.
- Keyboard: a focused page moves with arrow keys, rotates with `R`, toggles skip with `Delete`, with
  live-region announcements, matching the file list's keyboard model.
- The "reorder pages by drag-and-drop" subhead from MERGE-05 can return, and does, in this change.
- The page map is the shape MERGE-12 persists.

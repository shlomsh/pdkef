---
id: "RED-33"
title: "Delete by dragging a box: everything under it goes on release, one undo brings it back"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-33 · Delete by dragging a box: everything under it goes on release, one undo brings it back

*Shlomi, 2026-09-29: hover delete is amazing, but deleting an ID can mean nine clicks. Also support
dragging a box and deleting everything under it. Release deletes right away, with undo.*

- In Delete, hover and click stays exactly as today.
- Dragging (more than 5px) draws a box. Everything hover could delete (text, and the link lying over
  it per RED-27) is highlighted live when at least **half of its area** is inside the box, so a
  neighbour it only grazes stays.
- **Release deletes all of them at once.** No confirm step. One undo restores all of them.
- The drag is a gesture: the box and highlights live in the DOM during the drag; one deletion commits on
  release (golden rule).
- A drag that covers nothing does nothing.

## Acceptance

- An ID printed as nine separate digits is removed by one drag and restored by one undo.
- An item with less than half its area inside the box is not deleted.
- The saved file after a box delete passes the same checks as hover delete (no text, no link left
  behind).

## Undo and redo

- **One drag is one entry**, holding every deletion it made (and the RED-27 links it took with them). The
  toolbar Undo, Cmd/Ctrl+Z and the undo chip ("Deleted 9") each restore all of them together; redo
  deletes them together again.
- The chip reverts by entry id, so it restores the whole group even after a later edit, through
  `revertCommands` (which already clears redo for an out-of-order revert).
- A hover delete after a box delete stays its own step.

Acceptance: drag-delete nine digits, hover-delete one more word, then use the chip from the first
delete: the nine come back, the word stays deleted, and redo is empty.

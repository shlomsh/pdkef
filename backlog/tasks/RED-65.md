---
id: "RED-65"
title: "Repeat on all pages: verb labels and a way to remove the other copies"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-65 · Repeat on all pages: verb labels and a way to remove the other copies

Filed 2026-10-15 from Shlomi's report on pdkef.com/redact/, with screenshots of a blur box repeated on a 2-page form.

## What was wrong

- The unlinked box's button read **"Every page"**, a noun where every neighbour (Duplicate, Find, Delete, Peek) is a command.
- Once repeated, the **"On 2 pages"** menu offered only "Add to the remaining pages" and **"Unlink this page"**. Nothing took the copies off the other pages while keeping this one; the trash menu offers "This page" or "All N pages" only.
- "Unlink this page" did not say what it does: the copy stays, it just stops following the others' edits.

## Decision (wording approved by Shlomi 2026-10-15)

- Button before repeating: **"Repeat on all pages"**.
- The linked menu's heading explains the link: **"Changes apply to all {n} pages"**; the trigger keeps the status "On {n} pages".
- Menu items, all commands: **Add to the remaining pages** (unchanged, only with gaps), **Keep on this page only** (new: removes every other member of the group in one undo step), **Edit this page separately** (was "Unlink this page", same behaviour).
- The trash menu stays as it is. Hebrew gets matching wording.

## Done when

- `useLinkedBoxes` has `keepOnlyThis(id)`, one undo step, and RedactBoxToolbar offers it as `data-editor-repeat-group-keep-only`.
- Unit tests: the toolbar labels and item order, the hook's removal, and the island path (repeat on 3 pages, keep only on page 2, one box left, undo restores 3), each seen failing first.

---
id: "RED-37"
title: "Redact speaks one vocabulary, and every removal gets the undo chip"
status: "done"
priority: "P2"
epic: "redact-tool"
depends_on: []
---

# RED-37 · Redact speaks one vocabulary, and every removal gets the undo chip

*UX review 2026-09-29.* One act had seven names (cover, redact, mark, box, area, element, text run), and
only removing a box showed the undo chip.

Glossary: a drawn thing is a **box** (blur box, blackout box, whiteout box). Boxes **cover**; Delete
**deletes text or an image**. Never "area", "element", "text run", "object", "redaction box" in the UI.
No "Please", no "successfully".

- Every string in Redact follows the glossary (toolbar, box toolbar, Find, the saved-file check, repeat
  and clear menus, errors, announcements).
- Delete and Find's "Cover all" each show the undo chip; the chip names what went.
- No announcement reads the covered text aloud.
- The chip's Undo is a 44px target.

## Acceptance

- `grep` of Redact's user-facing strings finds none of the retired words.
- Deleting text shows "Deleted text · Undo"; Cover all shows "Covered 6 matches · Undo".

## Result (2026-09-29)

Glossary applied across Redact; Delete and Cover all show the undo chip; the Find announcement no longer quotes the covered text; the chip's Undo has a 44px hit area. Shared ElementToolbar titles ('Duplicate element', 'Delete element') are Sign's too and stay for now.

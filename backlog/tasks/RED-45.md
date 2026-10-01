---
id: "RED-45"
title: "A restored document says its boxes are back"
status: "done"
priority: "P3"
epic: "redact-tool"
depends_on: []
---

# RED-45 · A restored document says its boxes are back

Reopening a document with saved work restores its boxes silently. One quiet line in the status slot says so, and goes away on the first edit.

## Acceptance
- Copy in voice, no "draft", no "successfully". Not shown for a fresh document.

## Result

The status line's idle slot says "Your changes from last time are back. Undo still works." for a reopened document with work, until the first edit. (f3f1cd3f)

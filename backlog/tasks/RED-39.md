---
id: "RED-39"
title: "Redact recovers: a failed load offers another file, a new file starts clean"
status: "done"
priority: "P2"
epic: "redact-tool"
depends_on: []
---

# RED-39 · Redact recovers: a failed load offers another file, a new file starts clean

*UX review 2026-09-29.*

- A file that fails to load shows why and a Choose another file action; a password-protected file links
  to Unlock. The title is not "Redaction failed."
- Opening a new file disarms the tool, clears the selection, and closes Find with its term.

## Acceptance

- Loading a corrupt file shows a working Choose another file button on a phone.
- After a new file opens, no tool is armed and Find is closed.

## Result (2026-09-29)

A failed load shows the shell's Replace and points a locked PDF to Unlock; a new file disarms the tool, clears the selection and closes Find.

---
id: "SCAN-45"
title: "A disabled quiet button looks enabled"
status: "done"
priority: "P3"
epic: "scan-next"
order: 16
depends_on: []
---

# SCAN-45 · A disabled quiet button looks enabled

*Opened 2026-11-04* from a screenshot of Scan's corner screen (SCAN-44). Whole photo is disabled when the corners
are already the whole photo, but `.quiet-button` in `src/shell/pageWorkspace/PageWorkspace.module.css` has no
disabled style, so it looks ready to tap and does nothing. The same is true of every quiet button in the shared
workspace.

## Outcome

A disabled quiet button reads as disabled in every tool, using `:root` tokens.

## Acceptance

- [x] `.quiet-button:disabled` has its own look and no pointer cursor, as `.handoff-button:disabled` does.
- [x] Checked on Scan's Whole photo (disabled) beside Auto-detect (enabled); other tools share the one `.quiet-button` rule, not checked one by one.

## Done, 2026-11-14

Checked on a production build: with the corners already the whole photo, Whole photo is disabled with muted text, the
plain border and a default cursor, beside an enabled Auto-detect. The rule lives in the shared workspace sheet, so every
tool's quiet button gets the same look.

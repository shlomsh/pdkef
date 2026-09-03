---
id: "SIGN-12"
title: "Make required undo dependable"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done — dependable add/delete undo landed 2026-09-03"
---

# SIGN-12 · Make required undo dependable

## Scope and acceptance

**Make required undo dependable.** Reducer/action history: represent add/delete with atomic commands including original stacking positions; define clear-page and selective-history semantics. Test add-delete-undo chains and restored z-order. Undo for typing, moving, and styling is optional P3 work until approved.

**Completed 2026-09-03.** Sign and Redact now record additions and deletions as self-contained
commands. Every command retains the complete element snapshot, page, and original flat-array
index; single undo restores deleted elements at that index and removes additions by their captured
ids. Clear page is one multi-element delete command, and selective undo applies checked commands
newest-first, matching repeated single undo. Reducer and pure-command tests cover add/delete chains,
multi-element clear, selective semantics, persisted validation, and exact restored z-order. Typing,
movement, styling, and redo remain deferred P3 scope.

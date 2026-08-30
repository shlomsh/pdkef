---
id: "SIGN-12"
title: "Make required undo dependable"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SIGN-12 · Make required undo dependable

## Scope and acceptance

**Make required undo dependable.** Reducer/action history: represent add/delete with atomic commands including original stacking positions; define clear-page and selective-history semantics. Test add-delete-undo chains and restored z-order. Undo for typing, moving, and styling is optional P3 work until approved.

---
id: "SIGN-02"
title: "Repair selection/editing invariants"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-08-28"
---

# SIGN-02 · Repair selection/editing invariants

## Scope and acceptance

**Repair selection/editing invariants.** `SignToolContext.tsx`: delete/undo clear references to removed elements; replacing a document clears selection and editing; operations on other elements preserve the current edit session. Reducer tests cover each path. This does not expand undo scope.

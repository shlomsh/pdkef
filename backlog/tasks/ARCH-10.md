---
id: "ARCH-10"
title: "Replace permissive editor-shell types with shared contracts"
status: "open"
priority: "P2"
epic: "editor-architecture"
phase: "longer-term"
depends_on: ["SIGN-14"]
legacy_state: "Open — raised 2026-09-02 from architecture re-audit"
---

# ARCH-10 · Replace permissive editor-shell types with shared contracts

## Scope and acceptance

**The `.tsx` migration made type checking runnable, but not yet protective at the main
editor boundaries.** There are 154 `any` tokens across 42 non-test TypeScript files in
`src/components`, `src/editor`, and `src/lib`, including `SignToolContext` reducer
actions/history, `PdfSignTool`, `PdfRedactTool`, `PdfWorkspace`, node props, and registry
render adapters. Another 28 component tests start with `@ts-nocheck`. Extend the existing
`EditorElement` discriminated union with typed editor actions and history entries, use
pdf.js/PDF adapter types at the workspace seam, and migrate one vertical behavior slice
at a time. Remove `@ts-nocheck` only from tests whose production contracts were made
concrete; do not turn this into a repository-wide annotation sweep. Acceptance is that
invalid element/action payloads fail type checking in focused compile fixtures and the
runtime suite remains unchanged.

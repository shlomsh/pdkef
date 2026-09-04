---
id: "ARCH-10"
title: "Replace permissive editor-shell types with shared contracts"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "longer-term"
depends_on: ["SIGN-14"]
legacy_state: "Done — typed editor-shell boundaries completed 2026-09-04"
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

**Progress 2026-09-03.** The first vertical slice is complete. The Sign reducer
now accepts a discriminated `SignToolAction` union, Sign and Redact share a typed
`ActionHistoryEntry`, and invalid delete/update payloads are compile-time test
fixtures. The PDF loading and canvas boundary now uses pdf.js
`PDFDocumentLoadingTask`, `PDFDocumentProxy`, `PDFPageProxy`, and `RenderTask`
contracts instead of `any`. The full runtime suite remains green. At that
point the permissive editor element, gesture, node-prop,
saved-signature, and persisted-history boundaries remained; each is being
migrated as a separate behavior slice, with `@ts-nocheck` removed only where
the production seam is concrete.

**Progress 2026-09-03 (saved-signature slice).** The reusable signature shape is
now a shared `SavedSignature` model, distinct from the page-bound
`SignatureElement`. Preference validation, `PdfSignTool` state, the signatures
context, toolbar selection, and the placement-gesture input all share that
contract. Focused compile fixtures reject missing ids and string aspect ratios.
Keep this ticket open for the remaining permissive editor element, gesture,
node-prop, and persisted-history boundaries.

**Progress 2026-09-03 (persisted-history slice).** Persisted undo history now uses
validated, generic `ActionHistoryEntry<TElement>` commands with discriminated add/delete
operations and full element/index snapshots. Draft schema v2 migrates usable legacy commands,
drops malformed commands at restore, and hands each editor a typed initial state rather than
`unknown[]`. Compile fixtures reject malformed stacking positions. Keep ARCH-10 open for the
separate gesture and node-prop slices.

**Completed 2026-09-04.** The final node and gesture slices replace the permissive
Sign wrapper/node props with variant-aware element and mutation contracts, type every
placement/default/tool callback at the workspace seam, and move page-coordinate and
placement-gesture helpers to checked TypeScript. Redact drawing and deletable-object
boundaries now expose concrete tool, event, preview, and mutation shapes as well.
Focused compile fixtures reject cross-variant node patches, unsupported Sign tools, and
incomplete gesture element payloads; runtime coverage preserves placement, move, resize,
selection, and drawing behavior. The remaining broad types are outside the editor-shell
boundaries named by this ticket.

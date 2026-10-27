---
id: "ARCH-57"
title: "The widest components take grouped, typed props instead of 25 to 31 loose ones"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-57 · The widest components take grouped, typed props instead of 25 to 31 loose ones

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `BasePdfTool` takes 30 props, ten of them booleans (`ownsShell`, `ownsRating`, `dropAnywhere`, `needsPdfjs`, `hideIdentity`, ...) (`src/shell/BasePdfTool.tsx:113`).
- `PdfWorkspace` takes 29 and receives raw setters and `status: string` (`src/tools/sign/components/PdfWorkspace.tsx:139`); `RedactToolbar` 31 (`redact/RedactToolbar.tsx:47`); `RedactBox` 25.

## Outcome

- Props grouped into a few typed objects (layout flags, analytics, handlers) or a context; no raw setters cross the boundary.

## Acceptance

- [x] None of the four components takes more than 12 top-level props.

## Closed 2026-10-27

Top-level props: BasePdfTool 30 -> 11, PdfWorkspace 29 -> 12, RedactToolbar 31 -> 11, RedactBox 25 -> 9. Each groups its props into typed objects and destructures them into the old local names and defaults, so bodies and hook deps are unchanged. RedactBox's props carry no `any`. Setters reach PdfWorkspace as intent-named fields (signature.hold, signature.showDialog, announce). PdfWorkspace's props type lives in pdfWorkspaceProps.ts so the size records hold.

---
id: "ARCH-59"
title: "Every dialog opens and closes through one useModalDialog hook"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-59 · Every dialog opens and closes through one useModalDialog hook

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Duplication. Structure only: no behaviour change.

## Why

- The `showModal()` open/close effect and Escape capture are copied in six places: `src/shell/ConfirmDialog.tsx:49`, `redact/details/DetailsSheet.tsx:39`, `shell/PagePreviewDialog.tsx:76`, `compress/useComparePreviews.ts:190`, `sign/components/FontSheet.tsx:100`, `sign/components/SignatureDialog.tsx:155`.
- The top-layer rule (modals must use `showModal()` to show in fullscreen) has to be kept in six places.

## Outcome

- `useModalDialog(ref, open, onClose)` in `src/shell/`, used by all six.

## Acceptance

- [x] No dialog calls `showModal()` directly outside the hook; the hook has a unit test.

## Done (2026-10-27)

useModalDialog(ref, open, onClose, { escape, fallback, closeWhenHidden, syncOn }) in src/shell/ serves all six dialogs; each copy's Escape route, fallback and dependency list kept through options. No showModal() call remains outside it.

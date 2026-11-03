---
id: "QUAL-50"
title: "Assertions that cannot fail, or fail only on a refactor, are made real or removed"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: []
---

# QUAL-50 · Assertions that cannot fail, or fail only on a refactor, are made real or removed

*Filed 2026-11-03* from the unit-test audit recorded in QUAL-45. The suite has few of these; this collects the
ones the audit found so they do not mislead.

## Why

- **Cannot fail.** `expect(row).toBeTruthy()` on a non-null lookup
  (`src/tools/highlight/components/HighlightWorkspace.test.tsx:331`); `toBeTruthy()` on elements a throwing
  helper already found (`src/tools/sign/components/DraggableWrapper.test.tsx`); `toBeDefined()` straight after a
  wait that proved presence (`src/tools/split/PdfSplitTool.test.tsx`); the `@ts-expect-error` contract in
  `src/editor/model/savedSignature.contract.test.ts`, which proves nothing at Vitest run time.
- **Constant echoes.** `MAX_SAVED_SIGNATURE_ENCODED_BYTES` toBe 750,000; `DEFAULT_MARKER` restated from
  `HIGHLIGHT_COLORS[0]`; hex-shape checks on the highlight and comment palettes.
- **Title promises more than the assertion.** "calls onChange with the moved position" checks only a call count
  (`src/editor-ui/hooks/useDraggableElement.tap.test.tsx`); positive `toHaveBeenCalled()` with no arguments in
  `DownloadDone`, `NotePane`, `ReadingCapsule` and `RedactBoxToolbar` tests; "prints findings and exits 0" checks
  only the exit code (`scripts/check-swallowed-errors.test.mjs`).
- **Mock echoes.** `useEditorFileSession.test.tsx` "English defaults for a protected file" supplies the very
  string it expects; "wires draft persistence" checks a mock received what it was given.
- **Source-text pins.** About fifteen tests regex `.css` or `.astro` source (`SignToolbar.test.tsx` width and flex,
  `src/pages/__tests__/index.test.js` tooltip offset, `heroCondense.test.js`, `FileDropzone.test.tsx`'s SVG path
  string). They break on a refactor and pass on a broken render. Some guard real RTL, CSP or layout regressions
  that jsdom cannot see.

## Outcome

- Each item asserts the value its title promises, or is deleted when another test already does.
- Each source-text pin either becomes a small e2e or lint guard that checks the rendered result, or is kept with
  a one-line comment naming the regression jsdom cannot see.

## Acceptance

- [ ] Each item above is marked fixed, deleted (with the covering test) or kept (with the reason).
- [ ] `npm run check:fast` and `npm run check:push` pass.

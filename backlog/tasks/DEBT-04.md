---
id: "DEBT-04"
title: "Move draft persistence, the pdf.js render context and the Sign/Redact-only hooks to the folders that own them"
status: "done"
priority: "P1"
epic: "architecture-debt"
phase: "near-term"
depends_on: ["DEBT-02"]
---

# DEBT-04 · `editor` means Sign and Redact; `lib` means shared

*Filed 2026-09-14*, finding 4 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md),
which holds the measured consumer graph behind each move.

## Problem

`src/editor/workspace/draftStore.js` is imported by `shell`, `lib` and Merge; `adapters/pdf/renderContext.js`
by compress, split, to-image, lib and editor-ui; six `src/lib/` hooks have no consumer outside Sign and
Redact. Because of these, `editor` has to be a core project by fiat in `affected-scope.mjs` and "lib is
shared" is false. DEBT-06/07 cannot shrink `CORE_PROJECTS` until this lands.

## Scope

One commit per bullet, `check:fast` green after each:

- `src/editor/workspace/{draftStore,draftPolicy,useDraftPersistence}.{js,test.*}` ->
  `src/lib/drafts/`. `draftValidation.ts` and `useEditorDraftPersistence.ts` stay in the editor (they
  depend on the registry). Update `check-editor-dependency-directions.mjs`'s `EXCEPTIONS` (the
  `useDraftPersistence.js -> preact/hooks` entry moves with it or drops) and `vitest.config.js`'s
  `DOM_TESTS` (`src/editor/workspace/**` line).
- `src/editor/adapters/pdf/renderContext.js` -> `src/lib/pdfRender.js`.
- `src/lib/{useCurrentPage,useDraggableElement,useElementResize,useUndoShortcut,toolArming,usePdfCoordinates}`
  and their tests -> `src/editor-ui/hooks/`; `DOM_TESTS`'s `src/lib/use*` line follows.
- `src/lib/fontCoverageTable.js` -> `src/editor/text/`; `src/lib/dropFiles.js` -> `src/shell/`.
- Move the `SignMessages` type out of `src/i18n/toolMessages.ts` into `src/editor/registry/types.ts`
  (or `editor-ui`) and have `i18n` import it, so the core no longer depends on the site's message shape.
- Update `docs/module-boundaries.md`'s consumer tables and `.claude/rules/fonts-and-text.md`'s
  `src/lib/*ont*` glob (now `src/editor/text/fontCoverageTable*`).

## Acceptance

- `npm run test:module-boundaries`, `test:editor-dependency-directions` and the full `ci.yml` chain green.
- `nx show projects --affected --files=src/editor/model/editorModel.ts` no longer lists `shell`,
  `tool-merge`, `tool-compress`, `tool-split` or `tool-to-image`.
- No non-test file under `src/lib/` has Sign and Redact as its only consumers (re-run the review's
  consumer script or `grep -rl` each moved module).

## Landed (2026-09-14, `8ef3dad`..`cd0bdf8`)

Six commits, one per move, plus one fix: `renderContext.js` -> `src/lib/pdfRender.js`; the six hooks
-> `src/editor-ui/hooks/`; `fontCoverageTable.js` -> `src/editor/text/` (generator and
`fonts-and-text.md` glob follow); `dropFiles.js` -> `src/shell/`; draft persistence ->
`src/lib/drafts/` (`draftStore.test.js` needs jsdom, one `DOM_TESTS` line; the editor guard's
`useDraftPersistence` exception and its positive fixture follow); `SignMessages` ->
`src/editor/registry/messages.ts` with `i18n` re-exporting it. The move left
`useDraftPersistence.js` importing `DRAFT_SCHEMA_VERSION` from the editor; the constant now lives in
`draftPolicy.js` and `draftValidation.ts` re-exports it (`cd0bdf8`).

Acceptance: guards and the CI chain green; no non-test `src/lib/` module has Sign and Redact as its
only consumers (three have no `src/` consumer at all: `acceptNegotiation`, `fontCoverageReport`,
`liveFontCoverage`, DEBT-05's). **Not met:** `nx show projects --affected
--files=src/editor/model/editorModel.ts` still lists every tool, because Nx counts edges the
boundary rules allow and the moves did not touch:

- `lib -> editor`: `liveFontCoverage.js` (scripts-only) and five `src/lib/*.test.*` files that test
  editor modules (`fontCoverage.test.js`, `fontAttribution.test.js`, `languageCoverage.test.js`,
  `fontCoverageReport.test.js`, `drafts/useDraftPersistence.test.jsx`). DEBT-05 moves the first
  four; the drafts test imports `draftValidation` fixtures and needs a look.
- `shell -> editor`: `CompareSlider.tsx` -> `editor/gestures/controller.ts` (real, the only one).
- `editor -> site` and `lib -> site`: `src/editor/text/{bidiRuns,fonts}.test.js` and
  `src/lib/signHelpers.test.js` import `src/test/fixtures/`, which no Nx project owns, so `site`
  (root `src`) claims it. An Nx project at `src/test/` (test-support, beside `cross-tool-tests`)
  removes both edges.

So `editor` leaving `CORE_PROJECTS` (DEBT-07) needs DEBT-05 plus the two items above; DEBT-07 now
depends on DEBT-05 and lists them.

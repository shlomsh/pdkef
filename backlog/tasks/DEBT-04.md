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

## Landed (2026-09-15, part 2)

DEBT-05 landed separately in the meantime (`fontCoverage`/`fontAttribution`/`languageCoverage`/
`fontCoverageReport` all moved to `src/editor/text/`, so the `lib -> editor` edges they made are
already gone). This pass cut the three edges this ticket's own note above still named, one commit
each:

- `lib -> editor`: `src/lib/drafts/useDraftPersistence.test.jsx` now imports `DRAFT_SCHEMA_VERSION`
  from `./draftPolicy.js` (where it is actually defined) instead of the editor's
  `draftValidation.ts` re-export.
- `shell -> editor`: `src/editor/gestures/controller.ts` (and its test) moved to
  `src/lib/gestures/controller.ts` - real consumers outside the editor (`CompareSlider.tsx`, shell)
  as well as inside it (Sign, Redact, `editor-ui`'s drag/resize hooks), so `lib` is where it belongs.
  `src/editor/gestures/pointer.ts` stayed put (`editor-ui`'s only consumer of it).
- `editor -> site` and `lib -> site`: `src/test/` got its own Nx project, `site-test`
  (`src/test/project.json`, `cross-tool-tests` nested inside it the same way `fonts` nests inside
  `site-e2e`), so the five files importing `src/test/fixtures/wysiwygStrings.js` or
  `src/test/setInputFiles.js` (`src/lib/signHelpers.test.js`, `src/editor/text/{bidiRuns,fonts}.test.js`,
  `src/shell/{FileDropzone,BasePdfTool}.test.tsx`) now land on `site-test`, not `site`.
  `scripts/affected-scope.mjs`'s `extraPaths` filter needed a matching fix (`site-test`'s own root is
  the literal `src/test`, no trailing slash, which the existing `startsWith('src/test/')` skip does
  not match).

**Re-measured, not met - two edges neither this ticket nor DEBT-04's original pass named still widen
`editorModel.ts`'s affected set to everything (18 of 19 projects; only `font-assets` is absent):**

```
["editor","cross-tool-tests","tool-redact","site-e2e","tool-sign","fonts","editor-ui","site-test",
 "tool-image-to-pdf","tool-edit-pages","tool-compress","tool-security","tool-to-image","tool-merge",
 "tool-split","shell","lib","site"]
```

Isolated by temporarily severing each edge in turn and re-measuring (both reverted before
committing, `git diff` empty on both):

- `site -> editor`: `src/i18n/toolMessages.ts` does `import type { SignMessages } from
  '../editor/registry/messages'` and re-exports it, so every existing `from '../i18n/toolMessages'`
  import of the type keeps compiling. This is DEBT-04's own original work (commit `6c8fb0a`,
  2026-09-14, the same day as this ticket's first pass) - it already existed when this ticket's
  "Not met" note above was written, but was not among the three edges that note named. `i18n` has no
  Nx project of its own (no `src/i18n/project.json`), so Nx attributes it to `site` (root project,
  `sourceRoot: "src"`) the same way `src/test/` used to; unlike `src/test/`, there is no obviously
  correct narrower home to carve out here, since the type is meant to be shared canonically between
  the editor's registry and the site's message catalogue - moving it is a real design decision, not a
  mechanical relocation, and is left to whoever picks up DEBT-07.
- `site-test -> editor`: `src/test/signLanguagePage.test.js` imports `LANGUAGE_COVERAGE` from
  `src/editor/text/fontCoverageReport.js`. This edge predates this pass entirely (the file already
  lived in `src/test/` before `site-test` existed, so it was already a `site -> editor` edge under
  the old, unowned-folder attribution); creating `site-test` in this pass did not introduce it, but
  it did relabel it onto a project name this ticket just gave a clean, narrow-sounding identity to,
  and `site-test` is now depended on broadly enough (`lib`, `shell`, every tool, `fonts`,
  `cross-tool-tests`) that this one edge alone reproduces the same width `site -> editor` used to.

With both of those also severed (temporarily, for measurement only), the affected set is exactly
`["editor","cross-tool-tests","tool-redact","site-e2e","tool-sign","fonts","editor-ui"]` - the seven
projects this ticket's acceptance criterion names. That confirms the graph mechanism itself is sound
and narrows correctly once every edge into `editor` is gone; the two edges above are the remaining
work, and neither is a mechanical move like this pass's three - both need a design decision about
where a canonically-shared type and a language-coverage fixture actually belong. Left for DEBT-07 (or
a ticket DEBT-07 spawns) to resolve; not attempted here since it is outside this ticket's three named
bullets and outside this ticket's remit to decide.

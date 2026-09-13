---
id: "ARCH-15"
title: "Module boundaries: the target layout, the dependency rules, and a checker that ratchets today's violations down"
status: "open"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: []
---

# ARCH-15 · Module boundaries: target layout, dependency rules, ratcheting checker

*Filed 2026-09-13* out of the CI-speed review. Read this ticket first; the rest of the epic
(ARCH-16 to ARCH-20, QUAL-05) is the sequence that lands it.

## Problem

The code has grown modules the layout does not show. Measured on `main` at `4ca0e26`:

- `src/components/` is a flat bag of about 70 entries: nine tool islands (`Pdf*Tool.tsx`), the shared
  shell (`BasePdfTool`, `ToolShell`, `FileDropzone`, `DownloadButton`, `Popover`, ...), the editor's UI
  (`ElementToolbar`, `ElementResizers`, `FontPickerMenu`, `ColorPicker*`, `RedactBox`,
  `RedactToolbar`, ...) and the SEO `.astro` components, side by side.
- Import cycles: 17 flat files import into `MergeTool/` or `SignTool/`, and those two folders import
  eight flat files back. There is no boundary at which "this change can only affect Merge" is a
  checkable statement.
- The headless core leaks. `editor.md` says `src/editor/` has no Preact, but four of its files import
  from `src/components`: `registry/renderers.ts` (the documented exception), `registry/text.ts`,
  `model/editorModel.ts`, `workspace/useEditorDraftPersistence.ts`.
- `src/lib/` is mostly not shared: of 46 modules, 8 have three or more consumers, 15 have exactly one
  (per-tool logic in a shared folder), 14 have no island or editor consumer at all.

Why it matters beyond tidiness: an agent working on one tool has no one folder to work in; the
dependency directions the repo already states are not enforceable; and any change-scoped CI (the
Nx spike on branch `spike/nx` at `87c1ed1`, and `scripts/change-scope.mjs`) can only be as precise as
the boundaries. On the last 200 commits the ideal, file-level scoping puts 34 commits in a
single-tool bucket; `nx affected` on today's layout puts 0 there and 112 in "wide or everything",
because the flat `components` project absorbs every tool. The tool was right; the layout was the
finding.

## Target layout

```
src/shell/       BasePdfTool, ToolShell, FileDropzone, DownloadButton, PdfShareButton, Popover,
                 ErrorMessage, ProgressRing, DropzoneEmptyState, RecentFiles, FilePreview,
                 ConfirmDialog, homeWorkspace, sampleDocument         (imports no tool)
src/editor/      the headless core, leaks fixed (ARCH-19)
src/editor-ui/   ElementToolbar, ElementResizers, FontPickerMenu, ColorPicker*, ThicknessPickerMenu,
                 ArmHint, EditorToolStatus, EditorExportActions, EditorPageHeader, FullscreenButton,
                 ViewControl, UndoHistoryModal, PdfPageCanvas, DeletableObjectOverlay, DeleteMark,
                 SignatureDialog                                       (shared by Sign and Redact)
src/tools/<t>/   the island, its components, its lib modules, its unit tests, its e2e specs;
                 one folder per tool: merge, sign, redact, compress, split, edit-pages, to-image,
                 image-to-pdf, security
src/lib/         the genuinely shared modules only (about eight today)
site             src/pages, src/content, src/data, src/i18n, src/layouts, src/styles and the
                 .astro components, as today
```

Rules: a tool depends on `shell`, `editor-ui`, `editor` and `lib`, never on another tool; `shell`,
`editor-ui`, `editor` and `lib` never depend on a tool; `editor` never depends on `editor-ui` or
`shell` (it is headless); the site depends on tools only through the island entry points.

## Scope of this ticket

1. Write the design record `docs/module-boundaries.md`: the layout above, the rules, the evidence, and
   the sequence (ARCH-16 shell and editor-ui out, ARCH-17 the six simple tools plus Redact, ARCH-18
   Merge and Sign, ARCH-19 the editor leaks, ARCH-20 Nx on top, QUAL-05 sharding meanwhile).
2. Add `scripts/check-module-boundaries.mjs` and `npm run test:module-boundaries`, wired into the
   `checks` job of `ci.yml`. It reads relative imports (no bundler needed) and fails on any edge that
   breaks a rule, against an explicit allowlist of today's violations that only ever shrinks, the
   repo's ratchet pattern (see `check-css-duplication.js`). The four editor leaks and the
   components cycle go on the allowlist on day one so the check is green before a single file moves.
3. Point `.claude/rules/editor.md` at the record and fold the "editor is headless" claim into it as
   a checked invariant rather than prose.

## Acceptance

- The record exists and names every folder that moves and where it goes, so ARCH-16 to ARCH-18 are
  mechanical.
- `npm run test:module-boundaries` is green on `main` with the allowlist, red when a new tool-to-tool
  or editor-to-components import is added (prove it with a throwaway edit, then revert).
- No file moves in this ticket.

## Notes

- Things that hardcode paths and will need touching as folders move (list them in the record):
  the per-family `@source` entry sheets in `src/styles/`, the `paths:` frontmatter of every
  `.claude/rules/*.md`, `DOM_TESTS` in `vitest.config.js`, `check-class-resolution.js`,
  `check-gesture-golden-rule.js`, `check-editor-dependency-directions.mjs`,
  `scripts/change-scope.mjs`'s font-guard inputs, `playwright.config.js`'s `FONT_GUARDS` and
  `PERF_BUDGETS` globs, and the Architecture section of `CLAUDE.md`.
- Sessions work in parallel on `main`; each move lands as its own small commit, green, so the
  conflict surface for in-flight branches stays one folder at a time.

---
id: "ARCH-18"
title: "Merge and Sign into src/tools/, once the merge-tool epic's branch has landed"
status: "done"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-17"]
---

# ARCH-18 · Merge and Sign, the two tools with folders already, complete the move

## Problem

`src/components/MergeTool/` and `src/components/SignTool/` are already folders, but they sit inside
the flat tree they import from and are imported by (17 edges in, 8 out as of 2026-09-13). They are
last because Merge has an epic in flight on branch `claude/merge-tool-epic-adaab1` and moving the
folder underneath it would turn every commit there into a conflict, and because Sign is the largest
tool and the one the font guards load through (`src/editor/adapters/pdf/sign.js` stays in
`editor`; the island and its UI move).

Blocked until the open merge-tool tickets (MERGE-15, MERGE-18) are closed or retired and their
branch is on `main`.

## Scope

- `git mv src/components/MergeTool src/tools/merge/components`, `PdfMergeTool.tsx` and test, the
  Merge-only `lib` modules (`merge`, `mergePlan`, `sort`, and whatever the consumer table says),
  `e2e/merge/` into `src/tools/merge/e2e/`. Same for Sign with `SignTool/`, `PdfSignTool.tsx`,
  `SignatureDialog` if ARCH-16 left it in `editor-ui` for Sign alone, and the product specs under
  `e2e/sign/` that are not font guards (`sign-editor`, `form-grid-fill`, `toolbar-touch-targets`).
- The 27 font guards and their fixtures stay in `e2e/sign/` (they are font screening, not Sign the
  tool) and keep their `fonts` project; `scripts/change-scope.mjs`'s input list follows the paths
  that moved.
- The `src/components/` folder ends this ticket holding only `HeroDemo/` and the `.astro` files, or
  is renamed to `src/site/components/` if that reads better in the record.

## Acceptance

- Whole `ci.yml` chain green after each of the two commits; the font guards run (their inputs
  changed) and pass.
- The boundary checker's allowlist is empty of tool edges; the only remaining entries, if any, are
  the editor leaks ARCH-19 owns.
- `docs/ux-design-guidelines.md`, `.claude/rules/editor.md`, `home-page.md` and the memory of the
  Merge epic point at the new paths.

## Notes

- Done 2026-09-14, unblocked early: the merge epic's branch was gone and 18 of 20 MERGE tickets
  done, the two open ones a flagged spike and a product decision. Merge in `a80920d`
  (`MergeTool/` to `src/tools/merge/components/`, `merge.js`/`mergePlan.ts`/`outline.js` with it,
  `sort.js` stays shared with image-to-pdf, `e2e/merge` to `src/tools/merge/e2e`, `PERF_BUDGETS`
  globs widened); Sign in `22ef4f6` + `370ace3` (`nodeProps`'s resize types split into
  `src/editor-ui/nodeResizeTypes.ts` so `ElementResizers` stops importing Sign; `SignTool/` to
  `src/tools/sign/components/`, four lib modules plus `fontOfflinePacks.js`, the three product specs
  to `src/tools/sign/e2e/`; the 27 font guards, `language-acceptance`, `export-render-guard` and
  their fixtures stay in `e2e/sign/` as font screening).
- The allowlist is empty: `scripts/module-boundaries-allowlist.json` is `[]`, 0 of 815 edges
  violate a rule. `src/components/` holds only the `.astro` site components, `HeroDemo/` and
  `compareFigure.css`. `draftCheckingPlaceholder.test.tsx` and `draftRestoreRace.test.tsx` moved
  next to `draftStore.js` in `src/editor/workspace/`; `overlayElements.test.tsx` went with Sign.
- An esbuild metafile of `src/editor/adapters/pdf/sign.js` has 30 inputs, none under
  `src/tools/sign/`: the export core the font guards load is independent of Sign's UI.

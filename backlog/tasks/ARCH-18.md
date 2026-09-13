---
id: "ARCH-18"
title: "Merge and Sign into src/tools/, once the merge-tool epic's branch has landed"
status: "blocked"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-17", "MERGE-15", "MERGE-18"]
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

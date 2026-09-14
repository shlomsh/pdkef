---
id: "DEBT-02"
title: "The boundary checker scans test files: a test outside src/test/cross-tool/ may not import a tool it does not belong to"
status: "open"
priority: "P1"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-02 · Enforce the cross-tool test placement rule

*Filed 2026-09-14*, finding 3 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`check-module-boundaries.mjs` excludes `.test.`/`.contract.`/`.spec.` files; Nx does not. During
ARCH-20 three tests inside `src/editor/` importing Sign widened every Sign commit to 17 projects, and
the fix (`src/test/cross-tool/`) is a sentence in `docs/nx-affected-ci.md` only. The next such test
silently undoes the narrowing, and nothing goes red.

## Scope

- Scan test files in a second pass with one rule: a test under `src/{editor,editor-ui,shell,lib}/` or
  `src/tools/<a>/` may not import `src/tools/<b>/` for `b != a`; `src/test/cross-tool/` is exempt;
  `src/test/*.test.js` (the repo-wide guards) may import anything. Reuse `collectSourceFiles` with the
  `TEST_FILE` filter inverted; no new scanner.
- Add the rule to the checker's header comment and to `docs/module-boundaries.md`'s rule list as rule 6.
- Unit case in `src/test/moduleBoundariesRules.test.js` for the exempt folder and the violation.

## Acceptance

- Red with a throwaway `import PdfSignTool` in `src/editor/workspace/x.test.tsx`, green on `main`.
- `nx show projects --affected --files=src/tools/sign/PdfSignTool.tsx` still lists exactly
  `tool-sign, cross-tool-tests, fonts, site-e2e`.

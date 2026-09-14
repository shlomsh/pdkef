---
id: "DEBT-11"
title: "Split editor.md so a Merge or shell edit loads tool rules, not the Sign editor's, and src/test/ loads something"
status: "done"
priority: "P2"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-11 · The right rule for the file being edited

*Filed 2026-09-14*, findings 3 and 10 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`editor.md`'s `paths:` cover `src/tools/**`, `src/shell/**` and `src/lib/**`; 135 of its 202 lines
are Sign/Redact editor rules (arming, element toolbar, `SignToolbar.module.css`, pdf.js direction).
An agent in `src/tools/merge/` gets those and is only pointed at `docs/ux-design-guidelines.md`, the
guideline that applies. No rule matches `src/test/**`, so the DOM list, the cross-tool folder and the
e2e-versus-unit line load for nobody editing a test.

## Scope

- `editor.md` keeps sections "Shape of the editor" through "pdf.js render direction" with paths
  `src/editor/**`, `src/editor-ui/**`, `src/tools/sign/**`, `src/tools/redact/**`, the editor guard
  scripts and the editor design records.
- New `tools-and-shell.md` (paths `src/tools/**`, `src/shell/**`, `src/lib/**`, `e2e/tool-*.spec.js`,
  `docs/ux-design-guidelines.md`): "Draft persistence", "Other tools and `src/lib`", the cross-tool
  hand-off pattern, and the twelve UX-guideline headings as one line each with the doc link.
- New `tests.md` (paths `src/test/**`, `vitest.config.js`, `playwright.config.js`,
  `scripts/affected-scope.mjs`, `scripts/change-scope.mjs`, `docs/nx-affected-ci.md`): the DOM
  list mechanism, `src/test/cross-tool/` and why, "a spec must assert something jsdom cannot",
  where a spec that visits another tool lives (DEBT-01), the affected-scope rules in five lines.
- `CLAUDE.md`'s "Where the detail lives" table gains the two rows; stays under 200 lines.

## Acceptance

- `npm run check:guidance` green (every glob matches, every rule under 400 lines).
- For `src/tools/merge/PdfMergeTool.tsx` the matching rules are `tools-and-shell.md` only; for
  `src/test/cross-tool/draftRestoreRace.test.tsx`, `tests.md` only; for
  `src/tools/sign/components/nodes/TextNode.tsx`, `editor.md`, `tools-and-shell.md` and
  `fonts-and-text.md`. Verify with a five-line glob script against the frontmatter.

## Landed (2026-09-14)

`editor.md` now keeps only "Shape of the editor" through "pdf.js render direction", retitled to
"Sign/Redact editor", with paths narrowed to `src/editor/**`, `src/editor-ui/**`,
`src/tools/sign/**`, `src/tools/redact/**`, the two editor guard scripts and the four editor design
records (152 lines). `src/tools/merge/**` and the rest of `src/tools/`, `src/shell/**` and
`src/lib/**` moved to a new `tools-and-shell.md` (85 lines): "Draft persistence", "Other tools and
`src/lib/`", the cross-tool hand-off pattern, and all fourteen UX-guideline headings (the doc grew
past twelve since this ticket was filed) one line each with the link. A new `tests.md` (64 lines)
covers `src/test/**`, `vitest.config.js`, `playwright.config.js` and the affected-scope scripts: the
`DOM_TESTS` mechanism, `src/test/cross-tool/` and why (rules 6 and 7 of `docs/module-boundaries.md`),
and the affected-scope narrowing rules. `scripts/check-module-boundaries.mjs`,
`scripts/module-boundaries-allowlist.json` and `docs/module-boundaries.md` moved to
`tools-and-shell.md`'s paths since they concern every tool, not only Sign/Redact. `e2e/tool-*.spec.js`
alone only matched two loose top-level specs; added `e2e/tool-*/**` and `e2e/handoff/**` so
`e2e/tool-toolbars/` and `e2e/handoff/` are covered too. CLAUDE.md's table gained both rows and its
`editor.md` row now names the narrower paths; CLAUDE.md is 159 lines.

`npm run check:guidance` and `npm run check:fast` are both green. The glob-verification script
confirmed the three acceptance cases exactly: `src/tools/merge/PdfMergeTool.tsx` matches
`tools-and-shell.md` only, `src/test/cross-tool/draftRestoreRace.test.tsx` matches `tests.md` only,
and `src/tools/sign/components/nodes/TextNode.tsx` matches `editor.md`, `tools-and-shell.md` and
`fonts-and-text.md`.

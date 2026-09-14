---
id: "DEBT-11"
title: "Split editor.md so a Merge or shell edit loads tool rules, not the Sign editor's, and src/test/ loads something"
status: "open"
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

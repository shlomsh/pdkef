---
id: "ARCH-34"
title: "A change to one core project reaches only the projects that use it"
status: "in_progress"
priority: "P1"
epic: "unify-and-narrow"
horizon: "now"
order: 3
depends_on: []
---

# ARCH-34 · A change to one core project reaches only the projects that use it

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 1).

## Why

`site`, `editor`, `editor-ui`, `lib`, `shell`, `i18n` and `site-test` form one dependency cycle, so a
change to any of them reaches 23 of 24 projects; about 200 of 582 commits since 2026-10-05 went wide
(inferred from an import-graph replay). The record lists the edges that close the loop. The largest
one, `i18n/toolMessages.ts`, is ARCH-35; this ticket owns the rest.

## Outcome

- The back-edges are gone: `lib/signHelpers.js` moves into `src/editor/` (text and colour), and the
  boundary checker gains the rule that lib never imports editor; `PhoneFinish.tsx` stops importing
  `editor-ui`; `constants/signGeometry.js` moves into editor; the `languageCoverage.test.js` edge to
  `data/tools.js` is removed or moved.
- `src/data`, `src/site-lib` and `src/constants` stop being part of the catch-all `site` project, and
  test-support helpers become their own project apart from the repo-wide guards in `site-test`.
- The reach walk knows CSS that has an importer (`affected-scope.mjs:295`) and has a rule for
  `src/content/**`; `ANALYTICS.md` is docs-only; `public/images`, `public/.well-known` and `sw.js` have
  owners.
- `site-e2e` is split by directory so a tool-only commit no longer runs every site-wide spec.
- Dead config is removed: `unit_paths` and the per-project `test` targets left since ARCH-28.

## Acceptance

- [ ] Measured with `nx show projects --affected` before and after: a change to `lib/thumbnails.js`,
      `editor-ui/ElementToolbar.tsx` and `shell/pageWorkspace/PhoneFinish.tsx` each reaches only its
      real consumers. The before and after counts go in this ticket.
- [ ] A replay of the last 200 commits through `affected-scope.mjs` shows how many still go wide.
- [ ] `test:module-boundaries` fails on a planted lib -> editor import.
- [ ] Nothing that ran before is skipped for a change that reaches it (no fail-narrow).

## Progress (part A: back-edges)

- `src/constants/signGeometry.js` moved to `src/editor/model/signGeometry.js` (no non-editor, non-Sign/Redact consumer; `src/constants/` is gone).
- `src/lib/signHelpers.js` and its test moved to `src/editor/text/` (text direction and colour helpers together).
- `src/editor-ui/ExportHandoffs.{tsx,module.css,test.tsx}` moved to `src/shell/`, so `PhoneFinish.tsx` no longer imports `editor-ui`; Sign and Redact import it from shell.
- `languageCoverage.test.js` moved from `src/editor/text/` to `src/test/`, removing the editor -> `data/tools.js` edge.
- `check-module-boundaries.mjs` rule 10: lib may not import editor, editor-ui, shell, i18n or data; unit-tested in `check-module-boundaries.rules.test.mjs`.

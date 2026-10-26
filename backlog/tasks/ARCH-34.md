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

## Progress (part B: graph)

Done in `scripts/affected-scope.mjs`, `scripts/change-scope.mjs` and the `project.json` files; part A (moving
`signHelpers.js`, `signGeometry.js`, `PhoneFinish`'s import, `languageCoverage.test.js`) is another change.

- `data` and `site-lib` are Nx projects (a `constants` project was dropped at merge: part A emptied the folder) of their own and no longer part of `site`. They stay in
  `CORE_PROJECTS`: Nx cannot see an `.astro` page's imports, so without that a data change would no longer make
  `site` affected and would narrow past the home specs. The reach walk decides for them, as it did before.
- `unit_paths` and the per-project `test` targets (and `targetDefaults.test`) are gone; nothing read them since ARCH-28.
- The walk reaches a CSS file through its importer; `src/content/**` goes wide with a named reason (the layouts every
  page renders read the collections, tool specs visit those pages); `ANALYTICS.md` is docs-only; `public/images/**`
  runs the site-wide specs and no tool directory; `public/.well-known/**` runs no spec. Both live in `publicOwnerOf()`,
  not in a `project.json`, because `public/` is published verbatim. `public/sw.js` and the other loose public files
  stay unowned and widen.
- `site-e2e` is split into `site-e2e` (root specs, every tool) and `e2e-home`, `e2e-demo`, `e2e-handoff`,
  `e2e-offline`, `e2e-localized`, `e2e-cross-tool`, `e2e-content`, `e2e-toolbars`, each tagged `site-e2e` and
  declaring only the tool projects its specs visit. `scripts/e2e-projects.test.mjs` fails on a spec whose directory
  has no selectable project or does not declare a tool route it visits.
- Not done: the `test-support` project. The helpers other projects' tests import (`astroContentStub.js`,
  `mockFileShare.js`, `pdfPageTreeFixtures.ts`, `setInputFiles.js`, `setup.js`, `fixtures/`) sit loose in `src/test/`
  beside the one guard `noCamelCaseSvgAttrs.test.js`; a project is a directory, so this needs a file move.

Measured with `nx show projects --affected --files=<file>` (projects went from 24 to 39 because of the new ones, so
read the counts against that; the back-edges are part A):

| changed file | before | after |
| --- | --- | --- |
| `src/lib/thumbnails.js` | 24 of 24 | 34 of 39 |
| `src/editor-ui/ElementToolbar.tsx` | 24 of 24 | 34 of 39 |
| `src/shell/pageWorkspace/PhoneFinish.tsx` | 24 of 24 | 34 of 39 |

Replay of the last 200 non-merge commits before this change (`90690936`) through `deriveScope()` with the same
per-commit file lists: 93 went wide before, 77 after (16 narrowed, none the other way). 18 of the remaining 77 are
`i18n/toolMessages.ts` (ARCH-35); the rest are root config, `vercel.json`, `public/sw.js`, `middleware.ts`,
`api/`, and files that reach a non-tool page.

## Progress (test-support)

- Done: the helpers other projects' tests import moved to `src/test/support/` (Nx project `test-support`, no
  dependencies): `setup.js`, `astroContentStub.js`, `mockFileShare.js`, `setInputFiles.js`,
  `pdfPageTreeFixtures.ts`, `fixtures/`, plus a new shared `until.js` that replaces the three copies in the Split,
  Edit Pages and To Image tool tests. None of them imports a src project, so none had to stay behind. The repo-wide
  guards stay in `src/test/` (`site-test`); the module-boundaries checker still classes all of `src/test/` as
  test-support.
- Measured with `nx show projects --affected --files=<file>`, before and after: `src/lib/thumbnails.js` 33 to 33,
  `src/shell/pageWorkspace/PhoneFinish.tsx` 28 to 28, `src/editor-ui/ElementToolbar.tsx` 19 to 19. The counts do not
  move: the loop `lib -> site-test -> editor -> lib` is gone, but those files' dependents are real consumers.
- Core edges now: lib -> test-support; shell -> lib, test-support, i18n; editor -> lib, test-support;
  editor-ui -> lib, shell, editor; i18n -> data and data -> i18n (a two-project cycle); data -> i18n;
  site-lib -> lib, test-support, data, i18n, site, shell, editor; site -> data, i18n, site-lib (so
  site <-> site-lib is a cycle); site-test -> data, editor; test-support -> nothing.

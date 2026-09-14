---
id: "DEBT-10"
title: "Close the checker's core-to-site gap and fix the guidance that contradicts ARCH-20"
status: "done"
priority: "P2"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-10 · Rules and prose match the tree

*Filed 2026-09-14*, finding 9 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`ruleViolation('editor', 'site', 'src/pages/index.astro')` returns `null`: rule 2 forbids a core
folder importing a tool or `components`, not `src/pages/`, `src/layouts/` or `src/styles/`. No such
edge exists today. `.claude/rules/fonts-and-text.md` still says `change-scope.mjs`'s
`FONT_GUARD_INPUTS` is "the one list" and that nothing under `src/tools/sign/` is a font-guard input;
ARCH-20 deleted the list and `e2e/sign/project.json` makes `fonts` depend on `tool-sign`.
`backlog/tasks/ARCH-21.md` cites `src/lib/useWorkspaceGestures.ts`, which is in `src/tools/sign/`.

## Scope

- `check-module-boundaries.mjs`: core modules may import `site-i18n`/`site-data`, never `site`; add
  the clause to rule 2 in the header and in `docs/module-boundaries.md`; one case in
  `moduleBoundariesRules.test.js`. Note in the header that `.astro` `<script src>` is an edge the
  scan does not see (`HomePageLayout.astro:464`); do not parse it.
- Rewrite the font-guards paragraph in `fonts-and-text.md`: the `fonts` Nx project, its four implicit
  dependencies (`font-assets`, `editor`, `lib`, `tool-sign`), that six of the 27 specs drive `/sign`,
  and that a new input is an `implicitDependencies` entry in `e2e/sign/project.json`.
- Fix the path in ARCH-21.

## Acceptance

- Red with a throwaway `import` from `src/editor/geometry/coords.ts` to `src/layouts/BaseLayout.astro`;
  green on `main`.
- `grep -rn "FONT_GUARD_INPUTS" .claude docs backlog` returns only historical notes in done tickets.

## Landed (2026-09-14)

- `check-module-boundaries.mjs` rule 2 now forbids a core module (`shell`, `editor-ui`, `editor`,
  `lib`) importing `site` (pages/layouts/content/styles), while still allowing `site-i18n` and
  `site-data`; same clause added to `docs/module-boundaries.md`, plus a header note that an `.astro`
  `<script src>` (`HomePageLayout.astro:464`, verified still current) is an edge this scan does not
  parse. `moduleBoundariesRules.test.js` gained cases for each core module importing
  `src/pages/index.astro` (violation) and `src/editor/model/element.ts` importing `src/i18n/translate.js`
  and `src/data/tools.js` (both allowed). Red/green proved with a throwaway `import` from
  `src/editor/geometry/coords.ts` to `src/layouts/BaseLayout.astro`: it failed naming
  `src/editor/geometry/coords.ts -> src/layouts/BaseLayout.astro (editor may import site-i18n and
  site-data but not site (pages/layouts/content/styles))`; reverted, `git diff` empty, green again.
  `node scripts/check-module-boundaries.mjs` was already green on the untouched tree (0 allowlisted
  violations, no existing core-to-site edge).
- `fonts-and-text.md`'s font-guards bullet now describes the `fonts` Nx project
  (`e2e/sign/project.json`) and its four `implicitDependencies` (`font-assets`, `editor`, `lib`,
  `tool-sign`), with `scripts/affected-scope.mjs` asking Nx whether `fonts` is affected, instead of the
  `FONT_GUARD_INPUTS` list ARCH-20 deleted. Measured six of the 27 `e2e/sign/*.spec.js` specs
  navigating to `/sign` via `page.goto('/sign')` (arabic-vazirmatn-font-parity, greek-font-parity,
  hebrew-composition-guard, hebrew-font-parity, thai-font-parity, thai-sriracha-font-parity), matching
  the ticket's own count. `docs/module-boundaries.md:368` corrected to mark its `FONT_GUARD_INPUTS`
  mention as historical rather than current.
- `backlog/tasks/ARCH-21.md`'s two `src/lib/useWorkspaceGestures.ts` mentions fixed to
  `src/tools/sign/useWorkspaceGestures.ts` (verified with `ls`; the file's `toolMessages` import is
  real, only the path was stale).

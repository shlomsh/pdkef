---
id: "DEBT-01"
title: "Move the two cross-tool Playwright specs out of tool folders and guard the route a tool spec may visit"
status: "open"
priority: "P1"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-01 · A tool's e2e folder may only drive that tool's page

*Filed 2026-09-14*, finding 2 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

ARCH-20 narrows a Redact-only commit to `src/tools/redact/e2e/` plus `e2e/`, but
`src/tools/sign/e2e/toolbar-touch-targets.spec.js` also drives `/redact`, and
`src/tools/merge/e2e/merge-handoff.spec.js` ends on `/compress/` asserting Compress's identity row. A
Redact-only or Compress-only commit skips both. Nothing catches the next one.

## Scope

- Move `toolbar-touch-targets.spec.js` to `e2e/tool-toolbars/` and `merge-handoff.spec.js` to
  `e2e/handoff/` (beside `e2e/home/handoff.spec.js`); fix their fixture paths; check
  `playwright.config.js`'s webkit `testMatch` list still finds what it named.
- Add a rule to `scripts/check-module-boundaries.mjs`: a `.spec.js` under `src/tools/<t>/e2e/` may only
  `goto()` routes that `src/data/tools.js` maps to `<t>` (plus `/`); string-literal `goto` arguments
  only, same static stance as the import scan. One unit case in `src/test/moduleBoundariesRules.test.js`.
- One line in `.claude/rules/editor.md`'s "Test environments and E2E scope": a spec that visits another
  tool's page lives under `e2e/`.

## Acceptance

- `npm run test:module-boundaries` is red with a throwaway `goto('/redact')` in a Merge spec, green after
  the moves; `npx playwright test --list` still counts 139 product tests.
- `node scripts/affected-scope.mjs --base <sha>` on a Redact-only diff lists `e2e/tool-toolbars/` in
  `e2e_paths`.

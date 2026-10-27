---
id: "ARCH-45"
title: "Every tool folder follows one template, checked in CI"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-45 · Every tool folder follows one template, checked in CI

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- Ten tool folders follow five shapes. `src/tools/redact/` holds 60 non-test files in its root plus six ad-hoc subfolders; Sign, Merge and Compress use `components/`; PDF to Image and Image to PDF have no `e2e/`.
- A reader cannot predict where a file lives, and each tool needs its own mental map.

## Outcome

- One template: island at the root, `messages.ts`, and optional `components/`, `lib/`, `hooks/`, `e2e/`. Redact moves first.
- A shape check fails on a file outside the template.

## Acceptance

- [x] The shape check passes for all ten tools and fails on a planted stray file.
- [x] `check:push` green after the moves.

## Done (2026-10-27)

Every tool folder follows one template (root: the Pdf*Tool island, its CSS and tests, messages.ts, project.json; folders: components/, hooks/, lib/, state/, e2e/, verb/, __fixtures__/), written in .claude/rules/tools-and-shell.md. scripts/check-tool-shape.mjs (planted stray file and folder failed first) runs in CI and check:push and passes for all ten tools. 392 files moved with git mv: Redact 138, Sign 162 (fields/ to lib/fields/, fill/ split by kind), Scan, Compress, Merge and the small tools; the whole unit suite, check:push and e2e pass after the moves.

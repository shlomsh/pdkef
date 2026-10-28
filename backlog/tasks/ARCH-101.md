---
id: "ARCH-101"
title: "src/lib groups its modules by domain, and a check holds the shape"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-101 · src/lib groups its modules by domain, and a check holds the shape

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding C4.
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- `src/lib` holds 61 non-test files flat at its root, mixing PDF I/O, telemetry, hand-off and hooks.
- No check covers the folder shape of the shared layers, so the root can keep growing.

## Outcome

- Modules grouped by domain (pdf, telemetry, handoff, hooks).
- The folder-shape check extended to `src/lib`.

## Acceptance

- [x] No domain mixing remains at the `src/lib` root.
- [x] The shape check runs in CI and fails on a new flat root file in `src/lib`.

## Done (2026-10-28)

- 120 files moved with their tests into pdf/, pages/, images/, telemetry/, handoff/, output/, hooks/, text/ and app/;
  the root keeps only project.json. No barrels or shims; every import, test glob and path matcher rewritten.
- `findLibShapeViolations` in scripts/check-tool-shape.mjs (test-first) fails a flat root file or an unknown folder;
  `test:tool-shape` runs in CI, check:push, and now check:fast. The folder list is in docs/module-boundaries.md.

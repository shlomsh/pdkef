---
id: "ARCH-101"
title: "src/lib groups its modules by domain, and a check holds the shape"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
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

- [ ] No domain mixing remains at the `src/lib` root.
- [ ] The shape check runs in CI and fails on a new flat root file in `src/lib`.

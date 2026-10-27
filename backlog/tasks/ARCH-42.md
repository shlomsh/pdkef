---
id: "ARCH-42"
title: "The Nx project graph is asserted acyclic in test:module-boundaries"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-42 · The Nx project graph is asserted acyclic in test:module-boundaries

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Layering and dependency direction. Structure only: no behaviour change.

## Why

- The project graph has no cycle today (39 projects, 168 edges, zero strongly connected components), but nothing asserts it. The only cycle mentions are past incidents in `docs/nx-affected-ci.md:201`.
- A new cycle would silently widen every affected run to everything again, undoing ARCH-34.

## Outcome

- `test:module-boundaries` maps import edges to their owning `project.json` and fails on any cycle, naming the projects in it.

## Acceptance

- [x] A planted cycle between two projects fails the check with both names.
- [x] The check runs in CI and in `check:fast` when a `project.json` or import changes.

## Done (2026-10-27)

The cycle check lifts relative imports and implicitDependencies to their project.json owners and fails on any strongly connected component. With implicit edges it found a real cycle that ARCH-77 had closed (tool specs -> e2e/support owned by site-e2e -> every tool); e2e/support is now its own leaf project. 40 projects, 190 edges, no cycle.

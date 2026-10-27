---
id: "ARCH-102"
title: "src/tools/sign/lib is split into sub-areas with a file-count ratchet"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-102 · src/tools/sign/lib is split into sub-areas with a file-count ratchet

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding C6.
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- `src/tools/sign/lib` has 18 non-test root files across unrelated concerns (`carriedPatch`, `fontOfflinePacks`, `textCoverage`, `sign.js`).
- The tool template caps nothing inside `lib`.

## Outcome

- Sub-areas inside `lib` for the unrelated concerns.
- A per-folder file-count ratchet.

## Acceptance

- [ ] The 18 root files are grouped into named sub-areas.
- [ ] Adding a root file past the recorded count fails CI; removing one lowers the record.

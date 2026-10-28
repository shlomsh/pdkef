---
id: "ARCH-128"
title: "The boundary rules are written once and checked against every copy"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-128 · The boundary rules are written once and checked against every copy

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding M4.
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- The boundary rules are hand-copied into `CLAUDE.md` and the header of `scripts/check-module-boundaries.mjs`; only the doc is test-checked against the script.

## Outcome

- The doc test extended to the other copies, or the lists generated from the script.

## Acceptance

- [x] Changing a rule in the script without the other copies fails CI.

## Done (2026-10-28)

- `scripts/check-module-boundaries.doc.test.mjs` checks the script's header comment against `RULES` (same ids, each
  item names its rule) as it already did the doc, and checks that every rule number cited on a guidance line that
  mentions module-boundaries (CLAUDE.md, `.claude/rules/*.md`, comma lists and ranges included) is a live rule.
- The header had drifted: rule 10 was missing. It now carries every rule.

---
id: "ARCH-127"
title: "The advisory exceptions list holds no entry that matches nothing"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-127 · The advisory exceptions list holds no entry that matches nothing

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding V4.
Area: Supporting. Criterion: Dependency hygiene. Structure only: no behaviour change.

## Why

- `security/dependency-advisory-exceptions.json:4`: the braces exception matches no current `npm audit` finding.

## Outcome

- The entry deleted, or the advisory check made to flag unmatched exceptions.

## Acceptance

- [ ] The braces entry is gone.
- [ ] An exception that matches no finding fails the advisory check.

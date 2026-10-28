---
id: "ARCH-127"
title: "The advisory exceptions list holds no entry that matches nothing"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
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

- [x] The braces entry is gone.
- [x] An exception that matches no finding fails the advisory check.

## Done (2026-10-28)

- The braces entry is deleted; with zod's gone too (ARCH-126) the exceptions list is empty.
- `findUnmatchedExceptions` in scripts/check-dependency-advisories.mjs (test-first, 6 cases) matches by package and
  GHSA id at any severity; the weekly advisory scan fails naming each exception that matches no npm audit finding.

---
id: "ARCH-81"
title: "Every pure module has a test that references it"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 15
depends_on: []
---

# ARCH-81 · Every pure module has a test that references it

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 33 of 321 modules in `src/lib`, `src/editor` and `src/tools/*` have neither a sibling test nor a test import, including `src/editor/text/textTransforms.js` (108 lines), `src/editor/geometry/minimumSize.ts`, `src/lib/sort.js`, `src/lib/sanitizeOutputName.ts`, `src/lib/formatMessage.ts`, `src/tools/redact/check/runCheck.ts` (119 lines).

## Outcome

- Direct unit tests for the listed modules; a check that lists non-hook pure modules no test references, with a shrinking allowlist.

## Acceptance

- [ ] The six named modules have tests; the check runs in CI.

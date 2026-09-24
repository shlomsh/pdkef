---
id: "DEBT-23"
title: "One page-range parser: PDF to Image reads ranges the way Split does"
status: "in_progress"
priority: "P2"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-23 · Split and PDF to Image disagree on "8-"

*Filed 2026-09-24* from the boundaries audit (ARCH-25).

## Problem

`parsePageSelector` exists twice, `src/tools/split/split.js` and `src/tools/to-image/toImage.js`,
and the copies have drifted. Split accepts open ranges (`8-`, `-4`) and names the out-of-range page
in its error; PDF to Image accepts neither and does not bound-check pages. The same input gives a
different answer in two tools.

## Scope

- One implementation in `src/lib/` (Split's behaviour, the more complete one), with its unit tests;
  both tools import it; the local copies and duplicated tests go.
- Any user-facing hint or placeholder in PDF to Image that describes accepted formats is updated to
  match (voice rules, no em dashes).

## Acceptance

- One `parsePageSelector` in the repo; PDF to Image accepts `8-` and `-4`; both tools' unit tests
  and e2e stay green.

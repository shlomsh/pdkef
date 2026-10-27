---
id: "ARCH-98"
title: "Untriaged dependency advisories are triaged"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-98 · Untriaged dependency advisories are triaged

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- The advisory check lists appium and body-parser findings with no owner or decision (seen in wave 1, ARCH-91).

## Outcome

- Each finding is either fixed by a version bump within its range or carries an owned, dated exception with a reason.

## Acceptance

- [x] The advisory check reports no untriaged finding.

## Closed

Closed 2026-10-27. appium 3.9.0 patches body-parser; `check-dependency-advisories.mjs` over `npm audit --json` reports no untriaged high/critical finding (zod via @vercel stays under its exception to 2026-11-26).

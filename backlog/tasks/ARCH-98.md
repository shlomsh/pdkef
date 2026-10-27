---
id: "ARCH-98"
title: "Untriaged dependency advisories are triaged"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 3
depends_on: []
---

# ARCH-98 · Untriaged dependency advisories are triaged

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- The advisory check lists appium and body-parser findings with no owner or decision (seen in wave 1, ARCH-91).

## Outcome

- Each finding is either fixed by a version bump within its range or carries an owned, dated exception with a reason.

## Acceptance

- [ ] The advisory check reports no untriaged finding.

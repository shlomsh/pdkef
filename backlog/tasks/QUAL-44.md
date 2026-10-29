---
id: "QUAL-44"
title: "E2e keeps only what a real browser proves: duplicates go, jsdom-able cases move to units"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# QUAL-44 · E2e keeps only what a real browser proves: duplicates go, jsdom-able cases move to units

*Filed 2026-10-29* from a read-only audit (2026-10-28) that classified every Playwright test as KEEP (needs a
real browser), JSDOM (could be a Vitest+jsdom unit) or DUPLICATE (a unit already proves it). Of about 720
executed e2e cases, roughly 36 were duplicates and 35 could move to jsdom. CLAUDE.md wants e2e as sparse
guardrails, about 1 per 10 units, for what jsdom cannot prove.

## Outcome

- Every DUPLICATE named below is deleted once its unit is opened and confirmed to assert the same behaviour.
- Every JSDOM case named below becomes a unit first, seen failing against a deliberately broken
  implementation, and only then is its e2e deleted.
- A case whose e2e asserts something a unit cannot (a rect, real timing, a real download) stays, with the
  reason here.

## Acceptance

- [ ] Each test below is listed as deleted, moved or kept, with the covering unit or the reason.
- [ ] `npm run check:fast` and `npm run check:push` pass.
- [ ] The touched spec folders pass under `npx playwright test <paths> --project chromium`.
- [ ] The count of executed e2e cases removed is recorded here.

## Tests

(filled in as the work lands)

---
id: "SCAN-39"
title: "A page held too close is not told \"A darker surface helps\""
status: "in_progress"
priority: "P3"
epic: "scan-next"
horizon: "later"
order: 11
depends_on: []
---

# SCAN-39 · A page held too close is not told "A darker surface helps"

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

A page held too close reads as low contrast. It should get its own hint.

## Acceptance

- [x] A test that fails before and passes after.
- [ ] Checked on a real phone or the Scan e2e where the camera is involved.

## Progress, 2026-11-14

`want()` in `guidance.ts` gives 'fit' ("fit the page in") instead of 'contrast' when the border is faint and the page
fills `fillArea` (0.8) of the frame or more. Test in `guidance.test.ts`, seen failing first. 0.8 is a first guess:
the next phone session holds a page close on a light table and on a dark one, and the captures say whether 0.8 is
right. The ticket closes on that check.

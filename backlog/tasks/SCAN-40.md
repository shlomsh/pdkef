---
id: "SCAN-40"
title: "Plain-text pages hash further apart than the duplicate threshold"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
order: 12
depends_on: ["SCAN-23"]
---

# SCAN-40 · Plain-text pages hash further apart than the duplicate threshold

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

Plain-text pages hash only 14+ bits apart and the duplicate threshold is 12, a thin margin. Measure and widen the margin.

## Acceptance

- [ ] A test that fails before and passes after.
- [ ] Checked on a real phone or the Scan e2e where the camera is involved.

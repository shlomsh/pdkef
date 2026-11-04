---
id: "SCAN-41"
title: "A deleted page is forgotten by the duplicate check"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
order: 13
depends_on: ["SCAN-23"]
---

# SCAN-41 · A deleted page is forgotten by the duplicate check

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

A page deleted from the table stays remembered, so the shutter still refuses a retake.

## Acceptance

- [ ] A test that fails before and passes after.
- [ ] Checked on a real phone or the Scan e2e where the camera is involved.

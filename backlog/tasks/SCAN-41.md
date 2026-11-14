---
id: "SCAN-41"
title: "A deleted page is forgotten by the duplicate check"
status: "done"
priority: "P3"
epic: "scan-next"
order: 13
depends_on: ["SCAN-23"]
---

# SCAN-41 · A deleted page is forgotten by the duplicate check

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

A page deleted from the table stays remembered, so the shutter still refuses a retake.

## Acceptance

- [x] A test that fails before and passes after.
- [ ] Checked on a real phone or the Scan e2e where the camera is involved.

## Done by SCAN-65, 2026-11-14

SCAN-65 made the camera remember only the pages still in the scan: `keepTaken` is given the hashes of the photos
still kept, so a page deleted from the table is offered again. Its tests in `captureMachine.test.ts` ("only the pages
still in the scan count as taken (SCAN-65)") cover this ticket's case, a page removed from the stack is taken again.
The phone box stays unticked here: SCAN-65's own check covers it.

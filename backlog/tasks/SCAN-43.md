---
id: "SCAN-43"
title: "encodePages runs off the main thread"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
order: 15
depends_on: []
---

# SCAN-43 · encodePages runs off the main thread

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

`encodePages` still runs on the main thread.

## Acceptance

- [ ] A timing before and after on the same fixture.
- [ ] Output bytes are unchanged.

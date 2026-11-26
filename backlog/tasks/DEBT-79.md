---
id: "DEBT-79"
title: "A refused maintenance beacon counts as sent, so a service worker install failure is never retried"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "later"
depends_on: []
needs: "Shlomi's call on the product fix"
---

# DEBT-79 · A refused maintenance beacon counts as sent

*Filed 2026-11-26, from LAND-04's open list.* `beaconMaintenanceTransport` returns nothing, so a beacon the browser
refuses (`navigator.sendBeacon` answering false) is treated as sent, and `reportSwInstallFailures` never sends
that failure again. Found while making the maintenance telemetry tests real (LAND-04).

## Outcome

A refused maintenance beacon is kept and sent again on a later visit, the way a failed send already is, with a
test that refuses a real beacon (the recorder in `src/test/support/beaconRecorder.ts` can answer false).

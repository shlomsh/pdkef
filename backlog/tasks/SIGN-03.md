---
id: "SIGN-03"
title: "Retry failed live font loads"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-08-28"
---

# SIGN-03 · Retry failed live font loads

## Scope and acceptance

**Retry failed live font loads.** `liveFontCoverage.js`: rejected promises are evicted while pending/successful loads stay deduplicated. A subsequent coverage check recovers after connectivity returns. Tests use real font bytes, concurrent requests, and an outage/recovery sequence. Full offline provisioning remains SIGN-07.

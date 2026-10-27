---
id: "MEM-17"
title: "Service worker registration waits for the island's hydration and an idle callback"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "now"
order: 3
depends_on: []
---

# MEM-17 · Service worker registration waits for the island's hydration and an idle callback

*Filed 2026-10-27* from a loading measurement of origin/main.

## Why

- `src/site-lib/appUpdate.ts` registers `/sw.js` as soon as the window `load` event resolves
  (`await deps.loaded`, line 285, then `register`, line 295). The install starts fetching 1-5 ms later.
- `load` comes before the island has hydrated. In a throttled run (10 Mbps shared, 50 ms latency) /sign/
  fired `load` at 266 ms, the worker's first request went out at 267 ms, and the island hydrated at
  615 ms. 101 KB of the page's own 209 KB was still in flight when the worker started, so the two
  competed for bandwidth.

## Outcome

- Registration waits for a hydrated signal from the page's island, then an idle callback, with a
  `setTimeout` fallback where `requestIdleCallback` is missing (Safari). A page without an island falls
  back to `load` plus idle.
- The waiting is an injected dependency of `startAppUpdates`, like `loaded` is today, so it is unit
  testable without a browser.

## Acceptance

- [ ] Unit test: registration does not happen before the hydrated signal resolves.
- [ ] In the same throttled run, /sign/ and /redact/ show no worker request before hydration. The before
      and after timings are written in the Done section.
- [ ] `e2e/offline/app-update.spec.js` stays green.

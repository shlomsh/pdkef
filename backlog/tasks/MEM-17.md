---
id: "MEM-17"
title: "Service worker registration waits for the island's hydration and an idle callback"
status: "done"
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

## Done (2026-10-27)

- `src/site-lib/registrationReady.ts`: `whenReadyToRegister` waits for `load`, then every
  `astro-island[client="load"]` losing `ssr`, then `requestIdleCallback` (2 s timeout, `setTimeout`
  where it is missing), capped at 10 s after `load`. A page with no such island goes from `load` to idle.
  `startAppUpdates` takes it as the injected `ready`; five unit tests, including no registration before
  hydration.
- Throttled run (1.25 MB/s shared, 50 ms latency, production build), ms from navigation start:

  | page | | load | hydrated | first worker request | page bytes in flight then |
  | --- | --- | --- | --- | --- | --- |
  | /sign/ | before | 266 | 615 | 267 | 101,439 |
  | /sign/ | after | 267 | 606 | 614 | 0 |
  | /redact/ | after | 480 | 604 | 612 | 0 |
  | /compress/ | before | 438 | 500 | 440 | 4,419 |
  | /compress/ | after | 443 | 506 | 512 | 0 |

  /redact/ was not in the before run; the old code registered on `load` on every page, as the /sign/ and
  /compress/ rows show. Load and hydration times are unchanged: the gain is that the worker no longer
  shares the page's bandwidth.
- Rerun on the final whole-app worker, /redact/ throttled, two runs: hydrated 611 and 618 ms, first
  worker request 618 and 626 ms, 0 page bytes in flight; all 49 page requests finished before the
  worker's first.
- `e2e/offline/app-update.spec.js` green.

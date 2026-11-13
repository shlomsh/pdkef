---
id: "MEM-50"
title: "A telemetry change no longer needs a rise in the /open/ page budget"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-50 · A telemetry change no longer needs a rise in the /open/ page budget

*Filed 2026-11-12*, asked by Shlomi after the fourth rise of the same budget in one day.

## What happened

`scripts/check-precache-budget.mjs` holds one budget, `other`, for pages that are not a tool or the home
page. Its heaviest page is `/open/`. On 2026-11-12 it rose four times, each time for telemetry code and each
time with the owner's approval:

| Rise | Measured for /open/ | Cause |
| --- | --- | --- |
| 44,200 to 45,100 and 45,200 | 45,146 | MEM-45 page measures (request counts, LCP, open and export time) |
| 45,200 to 45,600 | 45,504 | MEM-45 first-view cohort and the second destination's sender |
| 45,600 to 46,200 | 46,114 | MEM-45 device, browser, operating system and referrer buckets |
| 46,200 to 46,300 (2026-11-13) | 46,269 | MEM-45 page view's mount time, result helpers for hand-offs and Drive saves |

A budget that every change in one area breaks is not telling us about that change. It is telling us the page
carries that area's code.

## What is suspected, not yet measured

`/open/` and `/drive/` send no usage event (no caller of `reportToolLifecycleEvent` or `reportHomePageView`
reaches them), yet since MEM-48 they load the one shared UI file, `/shared/ui.js`, which carries the telemetry
modules along with home and tool glue they do not use. So telemetry bytes land on a page that never runs them,
and that page happens to be the one the budget is set by.

## Find out first

- Which modules of `/shared/ui.js` does `/open/` execute, and how many brotli bytes of the file are telemetry
  (`src/lib/telemetry/**`)? Measure from a production build; do not estimate.
- What did MEM-48 gain by giving `/open/` and `/drive/` the one file (requests saved on a first visit), so the
  fix does not undo it without knowing the cost. See `docs/request-budget.md`.
- Whether the tool pages, which do run telemetry, have the same problem hidden under a roomier budget.

## Directions to weigh once the numbers are in

- Telemetry in its own chunk that only pages which send events load.
- `/open/` and `/drive/` on a smaller entry of their own.
- Leave the bundling and give telemetry its own byte budget, so a rise is judged against telemetry's size and
  not against an unrelated page.

## Done when

- The cause is stated with measured bytes.
- A telemetry-only change of the size of today's (about 500 brotli bytes) passes `test:precache-budget`
  without touching a budget number.
- The `other` budget is back to the measured weight of what `/open/` uses, plus the usual headroom.

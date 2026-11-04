---
id: "SCAN-21"
title: "Scan next: measuring a page's bend costs nothing a person can feel"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
order: 7
depends_on: ["SCAN-17"]
---

# SCAN-21 · Fast dewarp, off the main thread

*Opened 2026-11-04* from the SCAN-17 grid review.

## Why

`measureBend` adds about 0.3 s per page in Node here, and perhaps a second or more on a mid-range
phone. It runs inside `processPage` on the main thread, so the page can stall while a scan is processed.
Most of the time is two dense Cholesky solves (256 grid nodes plus up to 60 line offsets) and the ink
and rule masks.

## Outcome

- The grid solve uses its structure: the per-line offsets eliminated first (Schur complement) and a
  banded factorisation of the grid block (bandwidth about 2 x 16), about 20x cheaper. Same results to
  rounding: SCAN-17's tests and SCAN-20's scores unchanged.
- Measuring (and, if it fits, the warp) runs in a worker, as the live camera's detection already does
  (`lib/camera/camera.worker.ts`), lazily loaded with the pipeline: nothing new on any page's first load
  and nothing for other tools (MEM-15 install budget kept).
- Timing measured on a real phone, before and after, in this ticket.

## Acceptance

- [ ] Measuring a 3200 px photo stays under 150 ms on a mid-range phone, or the reason it cannot.
- [ ] The main thread stays responsive while pages process (no long task over 50 ms from the dewarp).
- [ ] SCAN-17's tests and SCAN-20's scores are unchanged.

---
id: "SCAN-09"
title: "Scan next: classical page-detection upgrades, each gated on the real corpus"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
order: 5
depends_on: ["SCAN-05"]
---

# SCAN-09 · Better detection without new bytes

*Opened 2026-11-03* from the detection research for [docs/scan-next.md](../../docs/scan-next.md).

## Outcome

Detection improves on SCAN-05's KPIs through changes inside today's approach, each landed only when the
corpus says it helps:

- a colour edge channel (gradients across colour, not gray only), so a coloured print or a page on a
  similar-gray table is seen;
- local contrast normalisation against shadow and glare;
- a coarse pass at about 160 px, then corners refined at 320 px;
- a line-segment detector in place of the Hough transform only if the corpus favours it (the reference LSD
  is AGPL: write our own or use an MIT/BSD port).

Each is a strategy behind the `EdgeGuesser` contract; a change that lifts one condition and drops another is
not landed.

## Acceptance

- [ ] Every landed change improves the SCAN-05 KPI table and worsens none; the before and after tables are in
      this ticket.
- [ ] The per-frame time budget holds.

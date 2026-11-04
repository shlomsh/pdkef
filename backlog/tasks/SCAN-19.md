---
id: "SCAN-19"
title: "Scan next: evaluate a small learned unwarping model (UVDoc) against the classical dewarp"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: ["SCAN-17"]
---

# SCAN-19 · A learned unwarp, evaluated, not adopted blind

*Opened 2026-11-04* when Shlomi chose "grid fit now, model later" for creased pages.

## Why

SCAN-17's classical dewarp reads a page's shape from its text rows and table rules. A crease or crumple
where the page has neither is invisible to it. UVDoc (Magne et al., 2023, MIT licence,
github.com/tanguymagne/UVDoc) is a small network trained on curved, folded and crumpled paper: 8M
parameters, a 488 x 712 input, a 45 x 31 unwarping grid out, which fits our single-resample warp
(`lib/dewarp/meshWarp.ts`) as is.

## Outcome

A measured decision, on real scans, between the classical dewarp alone, UVDoc alone and the two
together (UVDoc's grid, then SCAN-17's rows and rules on its output).

- Licence: confirm the weights carry the repository's MIT licence (`npm run test:licenses` policy).
- Weight: the model (likely 8-16 MB as fp16 or int8 ONNX) plus a WebAssembly runtime, fetched only when
  someone first processes a scan: never in the service worker's install (MEM-15) and never on another
  tool's page, so Redact visitors never download it.
- Speed: time per page on a mid-range phone; the budget is about a second.
- Quality: straightness of rows and rules (the SCAN-17 measures) on a set of real creased, curled and
  flat photos, flat pages included so nothing gets worse.

## Acceptance

- [ ] The before and after table is in this ticket, with the weight and phone timing.
- [ ] Adopted only if it beats the classical dewarp on creased pages without hurting flat ones.

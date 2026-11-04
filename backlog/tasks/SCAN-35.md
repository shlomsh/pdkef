---
id: "SCAN-35"
title: "Scan next: a flat page's edges are never read as bowed"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 7
depends_on: ["SCAN-17"]
---

# SCAN-35 · No false edge bows

*Opened 2026-11-04* from Shlomi's iPhone photo of a flat letter on concrete: `findEdgeCurves`
(`lib/dewarp/edgeCurves.ts`) reported strong bows on its top (a = 0.05) and left (a = 0.084) sides,
which skews the page it should only straighten.

## Outcome

Why it happened (texture on the concrete, the letter's own printed band, a fold's shadow, the search
picking another edge), and a fix that keeps the real bows SCAN-17's tests recover.

## Acceptance

- [ ] A test reproducing the false bow (from the cause, synthetic) that fails before and passes after.
- [ ] Shlomi's flat photos read no bow; SCAN-17's edge tests still pass.

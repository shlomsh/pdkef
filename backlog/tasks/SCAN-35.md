---
id: "SCAN-35"
title: "Scan next: a flat page's edges are never read as bowed"
status: "done"
priority: "P1"
epic: "scan-next"
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

- [x] A test reproducing the false bow (from the cause, synthetic) that fails before and passes after.
- [x] Shlomi's flat photos read no bow; SCAN-17's edge tests still pass.

## Closed 2026-11-04

Read on main at dc63a90b through the app's route (corners from the preview JPEG): `curves` is null on all four of Shlomi's photos. IMG_4757, 4758 and 4759 are flat by every measure (`bentPx` 0). IMG_4755 reads no edge bow; its 9.6 px comes from the row and column fits, which are not this ticket's mechanism.

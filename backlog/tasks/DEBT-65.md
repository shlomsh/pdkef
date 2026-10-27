---
id: "DEBT-65"
title: "Two layout-shift specs failed once each in the 2026-10-27 nightly"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 10
depends_on: []
---

# DEBT-65 · Two layout-shift specs failed once each in the 2026-10-27 nightly

*Filed 2026-10-27* from the scheduled CI run 40477105436 on e4441808 (`--repeat-each=2`).

## Why

Each spec failed one of its two copies and passed the other, on a different shard:

- `e2e/home/launcher-picker-pinned.spec.js:260` ("picker box is unchanged from first frame to
  settled layout at 390x844"), shard e2e (3): the picker moved 110.97px, bound 0.5px. Its other
  copy passed on e2e (1).
- `e2e/tool-hero-first-screen.spec.js:300` ("Merge restore keeps the hero the same height from
  first paint to the restored workspace"), shard e2e (1): layout shift 0.01206, bound 0.01. Its
  other copy passed on e2e (3).

The last green nightly was defc0e7f (2026-10-26 08:51); 199 commits landed in between (the
unify-and-narrow refactor, the Merge rebuild, SITE-44, SCAN-02). The 10-26 nightly failed only on
"Scan locked dependency graph", not on these. Neither spec showed a failure or retry in the six push
runs checked (40472200000, 40471776015, 40470656888, 40470287093, 40405613892, 40295206414).

Local, on a production build of e4441808: both tests `--repeat-each=10 --workers=4` passed 20 of 20;
both whole spec files `--repeat-each=6 --workers=10` passed 744 of 744. So far it reproduces only on
CI runners. A 111px jump is not timing noise in a measurement: something (recents, the launcher
grid, a font) lands after the first frame on that run.

## Findings (2026-10-27)

Both reproduce with `Emulation.setCPUThrottlingRate` on a production build; neither is timing noise.

- **Picker (phone, 390x844):** the first sampled frame is the server-rendered starter card, not the
  recents. The card is 111px taller than five real tiles, so the picker moves up when they land (CLS
  0.031 at 6x, y 744 -> 633, launcher 586 -> 475px). At 1x hydration finishes before the sampler's
  first frame, so it passed. Phones reserve no rows by design, so the spec was wrong, not the page:
  it now samples once the tiles are in and counts shifts from then on. Red at 6x before (3 of 6),
  green after; the whole file at 4x, 10 repeats, 150 of 150.
- **Merge restore:** `FIT_PATIENCE_MS` (`src/shell/pageGrid/stageFit.ts`) is a 400ms wall clock. When
  the thumbnails take longer (2.4-3s at 20x), the grid shows with page aspects unknown, then the
  fitted cell refits as they arrive: page cells 364 -> 310px tall, CLS 0.0387 + 0.0022 + 0.012 =
  0.053. At 1x and 6x there is no shift. A real slow-device shift in the shared PageGrid.
  **Fixed:** `openThumbnailSource` sources now report every page's aspect from its size
  (`aspects()`, no render), PageGrid reads them for every file as soon as it has pages, and the fit
  settles when that read ends (`fitSettled`'s `probing`), with `FIT_PATIENCE_MS` raised to 3000 as a
  safety cap only. Restore CLS is 0.0000 at 1x, 6x and 20x (was 0.05 at 20x); the spec at 4x, 10 repeats,
  10 of 10. A first attempt that left pages still being inspected out of "probing" settled early and
  made the spec fail unthrottled (0.039); the unit test now holds that case.

## Outcome

- Name what moves the picker and what shifts Merge's restore on a slow runner, with evidence (a
  trace or the shift sources from CI), then fix the product or the test's wait.
- Both specs stay green across the next nightlies.

## Acceptance

- [x] The cause of each failure is named in this ticket with the evidence.
- [x] Throttled local runs (CPU 4x) of both files with `--repeat-each=10` are green (picker file 150 of 150; Merge restore 10 of 10).
- [ ] Three consecutive nightlies with no failure of either spec.

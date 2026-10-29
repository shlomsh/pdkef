---
id: "DEBT-70"
title: "The Merge quiet-time \"shows preparing\" unit no longer times out now and then in CI"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-70 · The Merge quiet-time "shows preparing" unit no longer times out now and then in CI

*Filed 2026-10-29* from QUAL-44's CI run, which went red on a unit it did not touch and green on rerun.

## Why

- `PdfMergeTool quiet-time prepare > shows preparing only after a tap before the build is done, then delivers`
  (`src/tools/merge/PdfMergeTool.test.tsx`) timed out at the default 5000 ms in units shard 2 on runs
  40754935269 (2026-10-28) and 40843537024 (2026-10-29), and passed on rerun both times. Its sibling tests in the
  same run took 59 to 135 ms, so the runner was not slow: the unit stalled on a wait that never saw its condition.

## Outcome

- The unit waits on signals that do not depend on the real event loop's speed, and a stall names the step it
  stalled on instead of timing out silently.

## Acceptance

- [x] The failure is reproduced reliably first (throttle or hold the real work), then the same run is green.
- [x] The sibling tests that use `waitUntil(..., { dueFakeTimers: true })` in the same describe are checked for
      the same wait.
- [x] `check:fast` and `check:push` are green.

## Done (2026-10-29)

- **Not reproduced as it happened.** The unit passed 360 times in a row here (300 repeats alone, 40 of the
  whole describe, under 12 busy processes, with a one-thread libuv pool, and in six whole `src/tools` runs), so
  CPU load alone does not cause it. Both CI failures stall for the full 5 s while the three tests before it in
  the same run take about 90 ms each, so it was a wait that never saw its condition, not a slow one.
- **Two faults reproduce the exact CI signature on the old unit, 5.28 s then "Test timed out in 5000ms"**:
  (a) the build's real work before its first file read taking over 5 s (`PDFDocument.embedFont` held 6 s of real
  time), the case the test's own comment worried about; (b) the quiet wait being longer than 1700 ms, which is
  what any change inside the 3 s burst window before the tap does (`quietDelay` adds 500 ms per earlier change),
  seen by cutting the beforeEach's 4500 ms settle to 1000 ms. The old unit held one `File` read on
  `sources[0]` and waited on the real loop for the build to reach it, so it depended on both.
- **The fix is in the unit.** It holds `mergePdfs` itself (the same spy seam the file already uses), starts the
  build with the `pointerdown` a finger sends before it taps instead of waiting out the quiet timer, and
  delivers a stub blob, so nothing it waits on touches pdf-lib, the font, a file read or the quiet delay. Both
  faults above leave it green. A stall now names its step ("the build never started", "the held build never
  delivered") instead of a bare timeout.
- **Siblings.** The tests that pin the 1500 and 2500 ms boundaries (`keeps the ready look...`, `builds once...`)
  wait the same way and fail the same way when the start state is wrong (the 1000 ms settle made both time out),
  but they never failed in CI. The beforeEach that sets that state no longer settles by a count of 60 turns:
  it loops until the first build lands, bounded by 5 s of real time, and fails loudly saying so.

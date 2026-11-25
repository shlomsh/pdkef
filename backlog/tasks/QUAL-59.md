---
id: "QUAL-59"
title: "The note writer's lamp spec taps the mark where it is, not where it was"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# QUAL-59 · The note writer's lamp spec taps the mark where it is, not where it was

*Filed 2026-11-25.* `src/tools/highlight/e2e/note-writer.spec.js:129` ("in the lamp the writer covers the screen and takes
focus") failed once on Linux WebKit (CI run 45679879163, attempt 1): for 10 s the taps on the mark never opened
`[data-marker-row]`. Attempt 2 of the same commit and Chromium passed.

## Outcome

- The cause is shown, with a failing proof, and fixed at it, in the product if the product is at fault.
- No raised timeout, fixed sleep, retry, poll on a recorder, or new browser test.

## Result

*Closed 2026-11-25.* The spec was at fault. When the lamp opens, the page holds still for 220 ms and then rises to its
place, 82 px higher at this viewport, by 1 s (the `board` track of `enterPlan`). `pullCord` returned at once, so the spec
measured the mark 20 to 60 ms into that entrance, 82 px from where it ends. The test passed only when its first tap
arrived inside the hold. A later first tap missed, and `tapUntil` repeated the same stale point until it timed out.
The CI snapshot fits: lamp open, mark drawn, nothing picked.

Measured on WebKit with 10 workers, before: 3 of 40 failed, then 2 of 40 on an instrumented copy. In both of those the
first tap came at 218 and 282 ms, every later tap at y 390 hit the bare page with the mark resting at y 302, and every
click had `detail` 1, so it was no double click. A scratch copy whose first tap waits for 300 ms failed 4 of 4.

`pullCord` (`src/tools/highlight/e2e/lamp.js`) now waits for the board's own animations to finish, so all five lamp specs
start from a page at rest. After: the slow-tap copy 4 of 4, the real test 120 of 120 with 10 workers. The five lamp specs
on Chromium and WebKit, twice each: 62 passed and 2 failed, both "Edit from the card menu" on macOS WebKit,
which opens no lamp and fails the same way without this change (it passes on CI's Linux WebKit).
Linux CI run 45693201902 is green, with this test run once on WebKit; the flake was rare, so one pass is a check, not a rate.

The product is left as it is: a press during the one-second rise acts on what is under it then. A tap whose press and
click straddle the start of the rise can miss, as one of the traces did; that window is a few milliseconds.

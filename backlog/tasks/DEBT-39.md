---
id: "DEBT-39"
title: "PdfRedactTool.test.tsx hangs two tests a run, different ones each time"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-39 · Redact's island tests hang intermittently

*Filed 2026-10-04.* `npx vitest run src/tools/redact/PdfRedactTool.test.tsx` on `origin/main`
(b00eb4cd, 2026-10-03) failed two consecutive runs on an idle machine: each time 2 of 127 tests,
different ones, almost all by hitting the 25s test timeout ("RED-31: holding a box for 250ms peeks
it...", "Undo and Redo are one tap each on the toolbar...", "a picked colour makes the box
custom...", "Unlock it parks the file for Unlock, then navigates there"). One run had a single test
take 969s ("returns to auto once a drawn box commits and the one-shot tool disarms itself"). An hour
earlier the same file passed in a combined run.

## What it was

**Not a hang in the code: the Mac was asleep.** Every recorded failure falls inside a window where
`pmset -g log` shows the laptop on battery in Deep Idle, cycling a DarkWake of 5-7s with about 25s of
sleep between them, every ~32s. A test in flight when the machine sleeps is frozen with it; on wake its
5s timer is long overdue, so Vitest reports "Test timed out in 5000ms" at a duration of ~25s. Which test
it hits depends only on where the run was when sleep came, hence "different ones each time".

| Run (from another session's logs) | Started, ended | Failed tests | Sleep in that window |
| --- | --- | --- | --- |
| 3 concurrent runs, 3 different worktrees | 21:26:57, 21:28:33 Oct 3 | the same 2 in all three, 25.07s and 25.09s | DarkWakes at 21:26:55, 21:27:27, 21:27:59, 21:28:31 |
| the 969s run | 21:47:06, 22:04:57 Oct 3 | "returns to auto once..." at 969,360ms | asleep from ~21:47:40 to the DarkWake at 22:03:50, about 970s |
| check:push | 22:22:52, 22:24:34 Oct 3 | 1, at 25.09s | DarkWakes every ~32s from 22:22:20 |
| unit run | 00:12:36, 00:13:14 Oct 4 | 1, at 25.02s | DarkWakes every ~32s from 00:11:25 |

Three worktrees with different code stalling on the same tests for the same 25s rules out the code: the
shared thing was the machine. Awake, 51 runs on b00eb4cd and f6cd0223 (single, 3 parallel, CPU-profiled)
had no timeout and no test over 1.3s. Vitest counts afterEach time in a test's duration, but a test that
truly never settles reports ~5s and one that settles late is still cut at 5s (both checked), so a 25s
figure needs the whole process stopped.

## What shuffling found

The hunt turned up a real leak. `--sequence.shuffle` failed 7 of 12 seeds on f6cd0223, one test each:

- "SITE-41: picking a strength..." (6 seeds) and a RED-51 pipette test (1) read a blur strength or brush
  colour that an earlier test had remembered through `rememberAppStyle`. Only two nested describes and a
  few tests cleared localStorage; the file's outer `afterEach` did not.
- On b00eb4cd, under 8 parallel runs, "Delete tool > produces a smaller, still-valid PDF" found no
  delete candidate: `loadRealPdfAndSwitchToDelete` waited a fixed 50ms for a real on-demand pdf-lib
  import and parse.

## Fix (test file only)

- The outer `afterEach` clears localStorage, and the four nested `afterEach` clears it replaces are gone.
- `loadRealPdfAndSwitchToDelete` waits for the candidate through `settleUntil`, and `settleUntil`'s
  bound is a 2s time budget instead of 50 counted ticks, which run out on a loaded machine.

No timeout was raised.

## Acceptance

- [x] The hanging test(s) and the mechanism are named here, with the evidence.
- [x] The root cause is fixed; no timeout is raised. The sleep is outside the code; the order leaks it
  uncovered are fixed.
- [x] The file passes 10 runs in a row, and with `--sequence.shuffle`: 10 of 10 sequential, 10 of 10 on
  fresh seeds 3001-3010, the 7 seeds that had failed (2001-2011), and 8 of 8 run as 8 parallel processes
  on seeds 1001-1008. A fresh reviewer read the diff and found nothing incorrect.

## For the machine, not the code

A laptop that sleeps on battery between DarkWakes stalls any long run, Vitest or Playwright, the same way.
Running agents with the lid open on power, or under `caffeinate -i`, keeps a red run meaning a real one.

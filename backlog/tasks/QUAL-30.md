---
id: "QUAL-30"
title: "merge-ready-time guards the wait and the poll, not the merge"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-30 · merge-ready-time guards the wait and the poll, not the merge

Filed 2026-10-27 from run 40470656888 (18dbbccf): `expect(fromLastChangeMs).toBeLessThan(2600)` read
2776ms, then 2612ms on the retry; a rerun of the job read 2378ms and passed. 18dbbccf changed no Merge code.

## Answer in one paragraph

Not a regression. The reading is three things added together, and only one of them is the merge: the
quiet wait before the build (1500ms), the build (about 350ms on a Mac), and up to half a second of
Playwright `expect()` poll lag. The bound was calibrated while the wait was 600ms; the wait became 1500ms
on 2026-10-16 and the spec never said so. On 2026-10-26 a second population of slower runners appeared
(about a quarter of runs) whose build lands past the 1.85s poll, so the reading jumps to the next poll.
The fix is to time the build alone, in the page, so the wait and the lag are not in the number.

## The series

One series, not two: the spec only runs in the `perf` Playwright project, which is Chromium (Desktop
Chrome), in the job named `e2e-webkit`. No webkit-project run of it exists. 244 job attempts with a
reading, 2026-09-28 to 2026-10-27 (first reading per attempt; a retry's reading is listed apart):

| period | n | min | median | p90 | max | over 2400ms |
| --- | --- | --- | --- | --- | --- | --- |
| A: 09-28 to 10-15 21:00 UTC, 600ms wait | 162 | 1154 | 1448 | 1596 | 2146 | 0 |
| B: 10-15 21:00 to 10-25, 1500ms wait | 56 | 1706 | 1963 | 2107 | 2280 | 0 |
| C: 10-26, bare runner | 21 | 1775 | 2195 | 2826 | 2876 | 6 (28%) |
| D: 10-27, Playwright container (QUAL-29) | 5 | 1806 | 2120 | 2617 | 2776 | 1 (20%) |

The 24 latest attempts (UTC):

| start | run | commit | readings, first then retry (ms) |
| --- | --- | --- | --- |
| 10-26 14:10 | 40337242488 | ec669fcc | 1978 |
| 10-26 14:11 | 40337291170 | 944e9de1 | 2694 → 2522 |
| 10-26 14:53 | 40343947108 | cdf2f970 | 1839 |
| 10-26 14:58 | 40344726856 | 7f6f9b7f | 1864 |
| 10-26 15:31 | 40350228792 | 7501b387 | 2839 → 2592 |
| 10-26 15:50 | 40353197240 | 3ef20b18 | 2067 |
| 10-26 16:24 | 40358763852 | 9c8f33fe | 1842 |
| 10-26 16:41 | 40361495800 | 5f6a8a87 | 1924 |
| 10-26 17:07 | 40365644964 | eceecdb9 | 2826 → 2588 |
| 10-26 17:10 | 40366164788 | cade52e4 | 2235 |
| 10-26 19:49 | 40390240404 | 489c0ba6 | 2015 |
| 10-26 19:54 | 40390836756 | 275e2983 | 2876 → 2496 |
| 10-26 20:13 | 40393731168 | 43cf080e | 2705 → 2610 |
| 10-26 20:13 | 40393731168 | 43cf080e, rerun | 2218 |
| 10-26 20:21 | 40394949781 | e95c8d4f | 2220 |
| 10-26 20:29 | 40396079267 | 90690936 | 1960 |
| 10-26 20:39 | 40397523576 | 3b06c240 | 1952 |
| 10-26 21:17 | 40403035849 | 23f60d77 | 2244 |
| 10-26 21:35 | 40405613892 | 9d9331db | 2195 |
| 10-27 07:57 | 40470287093 | d2b3c66a | 1885 |
| 10-27 08:01 | 40470656888 | 18dbbccf | 2776 → 2612 |
| 10-27 08:01 | 40470656888 | 18dbbccf, rerun | 2378 |
| 10-27 08:11 | 40471776015 | 92a07f73 | 2120 |
| 10-27 08:15 | 40472200000 | e4441808 | 1806 |

The container went live in 3adfd0ce (10-26 22:14 local, after the 21:35 run), so the 10-27 rows are the
first in it. Fast-run median is flat across B, C and D (1963, 1978, 2003): the container changed nothing.

## When it moved

1. **2026-10-15 21:33 UTC, the wait.** Median 1448 → 1963 (+515ms), p90 1596 → 2107. Runs a64ea0ab (1494)
   and 1f3e05b4 (1983) bracket 35437e1e "Merge: quiet-time prepare", which replaced
   `PREPARE_DEBOUNCE_MS = 600` with `DEFAULT_QUIET.baseMs = 1500` (`src/lib/quietPrepare.ts`).
   acc81f22 updated two other e2e specs for the new wait (merge-direction-a, compress-note-no-shift) but
   not this one: its header still described a 600ms wait and "under 1100ms total" until now. The 2600ms
   bound was set in the 600ms era (that period's worst reading is 2146ms); the reading rose about 500ms
   the day the wait landed.
2. **2026-10-26 08:51 UTC, a second population.** 0 of 218 runs from 09-28 to 10-25 read over 2400ms;
   7 of 26 did from 10-26 08:51 on. Every one of those jobs also reads high on its retry (2496 to 2622),
   so it is the runner, not the sample. Same commit on a fresh runner reads lower: defc0e7f 2724 → 2622
   (nightly) then 1775 (rerun) and 1914 earlier on the push; 43cf080e 2705 → 2610 then 2218; 18dbbccf
   2776 → 2612 then 2378. Two jobs started 20 seconds apart on 10-26 (ec669fcc 1978, 944e9de1 2694).
   The runner image and agent are identical for slow and fast jobs (`ubuntu24/20261012.334.1`, runner
   2.338.0, Hosted Compute Agent 20261021.618), so the logs cannot say what differs. The SEO-25 timing in the same job (compare-preview)
   flips between about 5ms and about 145ms on its own and does not line up with the slow runs.
3. **Always, the poll lag.** `expect(...).toHaveAttribute` reports the first poll after the link appears,
   and polls at 100, 250, 500, then every 1000ms.

## Is it 18dbbccf? No, measured

18dbbccf touched shared code Merge does reach: `PageWorkspace.module.css`, `PdfTool.module.css`'s second
`:has()` argument, `useStageFit.ts`'s `cardFloor`, `DownloadElement`, `OutputName`, `FinishRow`. Built
d2b3c66a (its parent on main, 1885ms in CI) and 18dbbccf with the same toolchain in one worktree and ran
the unchanged spec against each, order flipped every round, 18 runs per build:

| | before d2b3c66a, median (p90) | after 18dbbccf, median (p90) | median change, 95% CI |
| --- | --- | --- | --- |
| spec as written, 1x CPU | 2091 (2106) | 2094 (2113) | +3ms [-244, +20] |
| same, 2x CPU throttle | 1926 (1950) | 1916 (1934) | -9ms [-29, +35] |

No difference at either speed. CI agrees: the commits after it that contain its changes read 2120
(92a07f73) and 1806 (e4441808).

## What the reading is made of

The page was instrumented (timer wrapper for the quiet wait, a `MutationObserver` for the instant the
link got its `blob:` href), spec as written otherwise. Build 20 files / 200 pages, local Mac, CDP CPU
throttle; "lag" is what the spec read minus when the link really appeared:

| CPU | quiet wait | build after the wait | link appeared at | spec read | poll lag |
| --- | --- | --- | --- | --- | --- |
| 1x | 1446 to 1448 | 162 to 177 | 1611 to 1623 | 2049 to 2120 | 438 to 500 |
| 2x | 1393 to 1420 | 254 to 284 | 1653 to 1683 | 1822 to 1918 | 169 to 235 |
| 2.5x | 1381 to 1401 | 599 to 643 | 1982 to 2045 | 2046 to 2081 | 35 to 99 |
| 3x | 1359 to 1364 | 919 to 1084 | 2278 to 2449 | 2343 to 2821 | 64 to 442 |
| 4x | 1299 to 1316 | 1716 to 1769 | 3019 to 3085 | 3278 to 3360 | 247 to 296 |

At 3x the spec as written reads 2838 to 2890ms with the app unchanged (three runs, bound 2600, all
red): the CI failure, reproduced without CI. The wait is 1300 to 1450ms of every reading and the lag
adds up to 500ms; the bound left about 1100ms for a build that costs 160ms after the wait here and
about 1000ms on a runner like the slow ones. The 1500ms timer fires 1300 to 1450ms after the spec sees
the last row's page count: it starts a little before the spec's own poll notices that row.

## Recommendation: take the fixed overhead out of the measured window

Not "fix a regression" (none), and not "recalibrate the bound": a bound over the slow population's 2876ms
would sit at about 3400ms and would be eaten again the next time the wait or the lag moves, which is how
this happened. MERGE-12's own acceptance is "under 500ms of real work", so the guard should time the
build.

## Change (`src/tools/merge/e2e/merge-ready-time.spec.js`)

- The test focuses the Download element (what a hover or keyboard visit does; `onFocus` →
  `prepareNow` ends the wait) and times, inside one `page.evaluate`, from the focus to the link's
  `blob:` href with a `MutationObserver`. No `expect()` poll is in the number.
- It asserts `buildMs < 2500`. Local: 331 to 363ms. CPU throttle (CDP, same build): 740 to 790ms at 2x,
  1190 to 1300ms at 3x, 1710 to 1980ms at 4x and 2230 to 2350ms at 5x, all green; 2700 to 2890ms at 6x
  and 3250 to 3430ms at 7x, red. So the bound is the 5x CPU line, with about twice the headroom the 3x
  figure (the slow CI population's reading) needs. A first pick of 2000ms was dropped: one 4x run read
  1978ms.
- The idle path (no hover; the wait elapses by itself) is still delivered end to end by the second test
  in the file, and the wait's own length is `quietPrepare.test.ts`'s and `PdfMergeTool.test.tsx`'s.
- A regression the guard cannot see: a build 2 to 4 times slower than today passes on a fast runner. That
  is what a wall-clock bound shared with a 3x-varying runner costs; the local figure (under 500ms) is
  the one to read when working on `mergePdfs`.
- Header and bound comments say what is measured; the 2026-09-28 recalibration story moved here.

## Done when

- [x] 18dbbccf ruled out by measurement: interleaved A/B, no difference at 1x or 2x
- [x] Series collected for 244 job attempts back to 2026-09-28; when it moved is dated above
- [x] Red then green: the spec as written fails `< 2600` at 3x throttle on an unchanged app; the new
      spec passes up to 5x and fails at 6x and 7x
- [ ] Landed on `main` (Shlomi confirms the push)
- [x] One CI run on a Linux runner prints `MERGE-12: built ...`: run 40485609159 (workflow_dispatch on
      `merge-ready-margin`, 04dcdb2e) printed `built 1170.6ms`, green, about 3.4 times the Mac and on the
      3x throttle line. The spec comment now carries it. One reading, from a fast-population runner.

## Left alone

- Why a quarter of runner draws became slow on 10-26. The logs show the same image and agent; a one-line
  `lscpu` before the perf step would tie a slow reading to hardware, if wanted.
- The failures of 09-25 to 09-28 (1625 to 2143ms against the old 1600ms bound) fit the same poll lag,
  but they predate the data this ticket collected, so that is not claimed.

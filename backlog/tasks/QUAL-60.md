---
id: "QUAL-60"
title: "Scan's camera browser test finishes well inside its wait on a slow runner"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-60 · Scan's camera browser test finishes well inside its wait on a slow runner

*Filed 2026-11-25.* `src/tools/scan/PdfScanTool.camera.browser.test.tsx:57` (`pagesMade(2)` in "opens the viewfinder from
Start scanning ...") hit its 8000 ms limit once on CI (run 45695044143 attempt 1, `units-browser (2)`), at a commit that
touched no Scan code. The whole test took 6.7 to 8.7 s on the four passing runs checked, 9.9 s on the failing one.

## Outcome

- Where the seconds go is measured, and whether the wait ever fails to end under load.
- The cause is fixed, in the product if the product is at fault: the test is clearly faster, or proven correct under load.
- No raised timeout, fixed sleep, retry, poll on a recorder, or new browser test.

## Result

*2026-11-25.* Slow, not stuck, and the test's input was the cause. Chromium's fake camera delivers 3840x2160, the most it
has of the 4096x3072 the product asks for. Each photo is warped to a 2400x1350 page, and the wait is mostly that pixel
work, twice in a row (one page at a time, by design). Nothing overlapped it: `buildScanPdf` starts after both pages.

Measured with the CPU held down (`taskpolicy -c background`, 10-core Mac on battery, other work running, so read the
ratios; alone this gives CI's 6 to 7 s). One run of the test alone, from an instrumented copy:

| | 3840x2160 | 640x480 |
| --- | --- | --- |
| two inspections | about 1.2 s | about 0.9 s |
| two pages' pixel work | 3.9 to 4.2 s | 0.5 to 0.6 s |
| the test | 6.6 to 7.2 s | 2.4 to 2.7 s |

Closing the camera after the second photo saved at most about 1 s, so the live camera is not the main cost. The second
page's pixel work took 1.4 to 2 times the first's at 4K. It was a one-time cost: processing either photo again took the
first page's time. The reason was not looked into (V8 re-optimizing is a guess).

The whole CI shard (2 of 2, three workers) held down the same way:

| test | before, two runs | after, two runs |
| --- | --- | --- |
| opens the viewfinder | failed at 8 s as on CI, twice | 7.0, 6.9 s |
| adds a page for each photo | 7.4, 8.9 s | 2.5, 6.7 s |
| adds the photos of the native input | 7.2, 5.6 s | 4.9, 6.2 s |

With the limit lifted in a scratch copy, the same load ended the wait after 12.5 s with both pages made, so no page is lost.
On the failing CI run, `idle()` in `afterEach` also settled.

The fix: `cameraLive` in the test sets the real track to 640x480 with `applyConstraints`, as the product does when a phone
is slow; every camera photo the test makes then measured 640x480. The product is unchanged: about 0.4 to 0.7 s a 4K page at
normal speed is real work. Mutation: without the `work.pages.length === 0` guard in `addCameraFiles`, the test still fails on its
last assertion (`{ source: 'camera' }` is not undefined).

Open: a Linux CI run of this branch, after Shlomi's OK to push.

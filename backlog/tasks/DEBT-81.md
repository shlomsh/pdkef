---
id: "DEBT-81"
title: "Merge's M08 Download test hung once on CI, past its 5 s budget"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "next"
depends_on: []
---

# DEBT-81 · Merge's M08 Download test hung once on CI, past its 5 s budget

*Filed 2026-11-27, from LAND-08's branch CI.* Run https://github.com/shlomsh/pdkef/actions/runs/46040083526 (shard 3/4)
failed one test of 3,903: `src/tools/merge/PdfMergeTool.test.tsx` > 'a tap on the preparing Download is busy until the
file lands, then offers Start again (M08)', `Test timed out in 5000ms`. The diff touched no Merge file and no test support.
It runs in under 33 ms locally, so on CI it hung, not ran slow. It is the first such failure in the last 30 CI runs, and 12
parallel local runs passed.

## What is known

- The file `a.pdf` is read four times: its page count (`merge.js:66`) and its thumbnail (`thumbnails.js:197`) at add, the
  build (`merge.js:224`), which `a.hold()` is meant to catch, and the page aspects (`thumbnails.js:282`) after release.
- Ruled out: the build starting before `hold()`. Fake timers cover `setTimeout`, `clearTimeout` and `Date`, which is the
  whole clock of `src/lib/output/quietPrepare.ts`, and `waitUntil`'s `dueFakeTimers` runs only timers already due.
- Not known: which wait hung. Both `waitUntil`s (the held read starting, the link appearing) have the same 5 s budget as
  the test, so the test's own timeout fires first and hides which one.

## Done when

- The hang is reproduced on demand and its cause written here, then fixed without a raised timeout, a sleep or a retry,
  or the test shown not to hang under the condition that caused it.

---
id: "QUAL-58"
title: "A Preact after-paint timer stops failing a DOM test file after its page is gone"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# QUAL-58 · A Preact after-paint timer stops failing a DOM test file after its page is gone

*Filed 2026-11-25.* A full local `check:push` ran 14,756 tests, all passing, and stopped on one unhandled error in
`src/tools/edit-pages/PdfEditPagesTool.open.test.tsx`: `ReferenceError: cancelAnimationFrame is not defined`, from
`Timeout.r` in `preact/hooks`. The next run was clean.

## Why

Preact schedules passive effects with `afterNextFrame`: a 35 ms timer and an animation frame, whichever is first. When the
timer fires after Vitest has torn jsdom down, `cancelAnimationFrame` is gone and the run fails although every test passed. Not
shown: which component's effect was left, and how to reproduce it on demand.

A general drain in the shared setup (e7e916d3b) hung six DOM test files on CI and was reverted (86cb8e4f9).

## Done when

- A run that reproduces it on demand, and its cause, are written here.
- The timer cannot outlive its test file, without a fixed sleep, and no DOM test file hangs on CI.

## Result (2026-11-26)

- **Cause:** the last test, 'a load failure still offers Replace file, which asks first', clicked Replace file and
  ended. Opening the dialog renders `PdfEditPagesTool` once more after the click's `act` scope, so Preact's
  `afterNextFrame` left one 35 ms timer pending when the file ended. If it fires after jsdom is torn down, its
  `cancelAnimationFrame` call throws.
- **Reproduced on demand:** a scratch copy of the file, never committed, that wraps `setTimeout`/`clearTimeout` to
  count live 35 ms timers and reports the count in an `afterAll`. Before the fix: 1 pending at file end in 3 of 3
  runs. After: 0 in 3 of 3. The crash itself needs that timer to fire after teardown, which is timing, so the count
  is the on-demand form.
- **Fix:** the test awaits `s.drain()` after the click, inside `act`, so the render settles in the test. No shared
  setup change, no sleep; the file passed 10 runs in a row.
- **Again, 2026-11-27:** branch CI run 46037726619 (shard 1/4) failed the same way from
  `src/tools/to-image/PdfToImageTool.files.test.tsx`. Its last test, 'shows the Hebrew protected-file copy', ended
  with one 35 ms timer pending (3 of 3 runs, same counting copy); its English twin already awaits `s.drain()` after
  the NeedsUnlock screen shows. The Hebrew test does too now: 0 pending in 3 of 3, and the file passed 10 runs in a row.

## For every file (2026-11-27)

- A check that failed any jsdom file ending with Preact's after-paint flush still pending found 15 of 350 files, about
  60 tests, most of them fast synchronous ones that never give the event loop a turn (`RedactEditor.test.tsx` has 29
  tests and no `await`). The flush simply had not had its 35 ms yet; nothing in those tests was wrong.
- So the jsdom setup (`src/test/support/setup.js`) schedules Preact's flush through `options.requestAnimationFrame`
  with `src/test/support/afterPaintGuard.ts`: Preact's own rAF-plus-35-ms race, reading the timers at call time so
  fake timers still apply, and at the end of the file it cancels whatever is still pending and drops anything
  scheduled later. No flush can fire after jsdom is gone, in any file.
- Proof: the guard's unit tests (a pending flush never runs after the file ends, a later one is dropped, fake timers
  still hold it), and the To Image test without its `s.drain()` failed the file 3 of 3 under the failing form of the
  check, naming the test.

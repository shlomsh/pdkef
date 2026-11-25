---
id: "QUAL-58"
title: "A Preact after-paint timer stops failing a DOM test file after its page is gone"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
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

---
id: "SCAN-58"
title: "A camera shot that fails is not counted as taken"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: []
---

# SCAN-58 · A failed shot stays on offer

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`. Traced in the code, not seen on a device.

## Outcome

- A page's hash is remembered only once its photo is kept. If `takePhoto()` rejects, or `shoot` returns early
  because a shot is under way, the same page is offered again and auto capture can take it.
- `useCamera` has a unit test for that failure. It has none today, and `Viewfinder.test.tsx` mocks it out.

## What happens today

`captureMachine.ts` writes `takenHashes` when the machine fires, before the shot resolves. When the shot fails,
`useCamera` only calls `reportError`. The hint says to turn the page, the stack count stays put, and showing the
page again says it is already taken. Only the manual shutter gets out of it.

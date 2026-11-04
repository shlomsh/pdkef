---
id: "SCAN-14"
title: "Scan next: a page is taken only once it is clear and in focus"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 4
depends_on: ["SCAN-07", "SCAN-08"]
---

# SCAN-14 · Taken only when clear and in focus

*Opened 2026-11-04.* Shlomi scanned in the dark on the iPhone: the page was taken as soon as the outline locked,
before the picture was clear and focused.

## Why it happens (read from the code, not yet measured on the phone)

The gate is Laplacian variance at or above 100 on the 320px frame. Sensor noise is exactly what that measure
rewards: white noise of sigma 8, ordinary in a dark room, scores about 20 x 64 = 1280. So a dark, unfocused frame
passes, and nothing waits for autofocus. At 320px a page's text is not resolved either, so that frame cannot
judge focus even in good light.

## Outcome

Auto waits until the picture has stopped improving, judged on real detail with the noise taken down. The shutter
always works.

## Worker D: definition of done

Files: `lib/capture/` (`types.ts`, `sharpness.ts`, `observe.ts`, `captureMachine.ts` and tests),
`lib/camera/frameGrab.ts`, `lib/camera/camera.worker.ts`, `hooks/useCamera.ts`.

1. Each frame also carries a `focus` value, measured on a 256px crop from the centre of the video at its own
   resolution, binned 2x2 before the Laplacian (`focusMeasure`, pure).
2. `focusMeasure` is tested: noise alone scores well under the same noise over sharp text, and blurred text scores
   under sharp text at the same noise.
3. The machine fires only when the hold has lasted `holdMs` and `focus` has been settled for `settleMs`: every frame
   since the start of the settle window within `settleRatio` of that frame's focus, up or down. Leaving that band
   starts a new window, so a slow climb keeps waiting and one stray frame costs one window.
4. Tests on frame sequences: focus still rising does not fire, then fires once it settles; a drop restarts the
   settle; flat focus fires at `holdMs`; a blank page (flat, low focus) still fires; leaving the hold resets it.
5. `holdMs` is 800. Today's tests keep passing except where they pin 600.
6. The ring never passes full while it waits, and the hint stays "Hold still".
7. The frame loop stays one message per frame, both buffers transferred, nothing new on the main thread but one
   small `drawImage` and `getImageData`.
8. `markTaken`, the shutter and the same-page guard behave as before.

## Lead

- Fake-camera e2e still takes a page by itself; matrix green.
- On the iPhone, in the dark: Shlomi confirms it waits. `settleRatio` and `settleMs` are first guesses until then.

## Progress

2026-11-04: built and landing. The settle window is anchored to its first frame, tightened by the lead after a slow
climb and one stray frame both proved wrong in tests. Still in progress: Shlomi's run on the iPhone in the dark.

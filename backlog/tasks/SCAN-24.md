---
id: "SCAN-24"
title: "Scan next: the camera says what would make the shot better"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 3
depends_on: []
---

# SCAN-24 · Guidance while scanning

*Opened 2026-11-04* from Shlomi's phone test: it is not clear when a better angle, more contrast or a
flatter page would help.

## Outcome

The viewfinder's one hint line (today "Point at a page", "Hold still", "Page n. Turn the page.") says
the one thing that would help most, from signals the camera already measures or can cheaply add:

- steep angle (a strongly keystoned quad): hold the phone flatter over the page;
- poor contrast with the background (a light page on a light table): a darker surface helps;
- moving (jitter): hold still;
- too small or cut off at the frame's edge: move closer / fit the whole page;
- `duplicate` (SCAN-23): this page is already taken, turn the page;
- after a page is taken, a strongly bent or creased page (from SCAN-21's measured bend): a quiet note on
  that page that flattening it gives a cleaner scan.

One message at a time, by priority, steady (no flicker between hints), in the voice guide, in
`messages.ts`, announced politely to screen readers. The shutter button is never blocked.

## Acceptance

- [x] A pure `lib/capture/guidance.ts` choosing the hint, with tests for each condition and for steadiness.
      (`guidance.test.ts`: each condition, priority, steady, hysteresis, screen-reader gap)
- [ ] The viewfinder shows it on a phone, checked on a real iPhone.

## The auto shutter waits for framing, 2026-11-04

Shlomi's first iPhone run: "Move a little closer" and "Hold still" worked, but the shot fired on a tilted page and on one with its corners cut off, because this ticket first said hints never hold a shot. Now `fit` and `flatter` hold the auto shutter by the same thresholds the hints read (`framing.ts`, `edgeMargin` 0.02, `minKeystone` 0.6). The shutter button still takes anything.

A printed page cut off by the frame is found with high confidence, its bottom side on the last line of print and every corner well inside the frame, so corners alone cannot see it. `runsOff` (`pageSignals.ts`) reads paper carrying on past a side to the frame's edge. Faint-edge pages skip it, since their paper has no step.

Measured on Shlomi's four photos, cropped in memory at 10% and 20% on each side (32 crops): 28 find no page, 2 are held, and 2 would still fire, both 10% crops (IMG_4758 right, IMG_4759 top). Whole pages are never held. To re-check on the phone.

## The camera analyses what is on screen, 2026-11-04

The viewfinder shows the video under `object-fit: cover`, but every frame was analysed whole. So a page with corners off screen read as whole and the shot fired, and with the phone held sideways (the stream goes landscape, the screen shows about half its width) a page filling a third of the view was under `minArea` of the frame: "Move a little closer", no outline. On Shlomi's screenshot of that moment the detector itself found the slip at confidence 0.96.

`frameGrabber` now crops each frame to `visibleShare`, so the capture machine and the hints work on what the person sees, and quads go back through `toFrame` for the outline and the shot; `takePhoto` keeps the whole frame. With the crop switched off, `camera.spec.js` fails 4 of 6, the sideways and off-screen cases among them. That the stream goes landscape on Shlomi's iPhone is inferred from the screenshot and the `onresize` comment: to confirm on the phone.

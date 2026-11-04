---
id: "SCAN-15"
title: "Scan next: pinching the camera zooms the picture, not the page"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 5
depends_on: ["SCAN-13"]
---

# SCAN-15 · Pinch zooms the camera

*Opened 2026-11-04.* Shlomi pinched in the viewfinder on the iPhone: the browser zoomed the whole page and the
controls and the edges of the picture went out of view.

## Outcome

In the viewfinder a pinch never zooms the page. Where the camera offers zoom, the same pinch zooms the picture, and
the page finder and the photo both work from that zoomed picture, so a page across the table can be brought close.

## Why the camera's own zoom, not a scaled video

The page taken is found again in the full photo, so a video scaled on screen would still give the whole table to
the finder, and the other paper in view could win. A zoom on the track changes what the camera itself sees.

## Definition of done

1. The viewfinder has `touch-action: none`, and `gesturestart` is cancelled for iOS. Taps on its buttons still work.
2. `zoomRange` and `pinchedZoom` are pure and tested: no zoom on offer gives null; the pinch scales from the zoom at
   its start, clamps to the range and to 5x the minimum, and lands on the step.
3. `latestOnly` is pure and tested: a pinch outruns the camera, so only the newest value waits for the one in flight.
4. Applying zoom keeps the track's other constraints, so the stream's size does not reset.
5. Nothing passes through state during the pinch.
6. A refused `applyConstraints` costs the zoom only: no error on screen, no shot lost.

## Lead

- Production build, phone size: with zoom stubbed on the track, a two-finger pinch reaches `applyConstraints` and
  `visualViewport.scale` stays 1, and the buttons still work after it.
- On the iPhone: Shlomi confirms the picture zooms, and that a page taken zoomed in comes out as that page. Neither
  can be proved here: the fake camera offers no zoom, and whether iOS does was not established from documentation.

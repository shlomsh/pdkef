---
id: "SCAN-34"
title: "Scan next: a page photographed at an angle keeps its true proportions"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 6
depends_on: []
---

# SCAN-34 · No squashed pages

*Opened 2026-11-04* from Shlomi's iPhone photos: three A4 pages (1.41:1) came out 1.26, 1.19 and 1.22.

## Why

`warpSize` (`lib/warp.ts`) sizes the output from the quad's edge lengths in the photo. A page shot at an
angle is foreshortened along the tilt, so it comes out squashed by 10-15%.

## Outcome

The page's true aspect recovered from its four corners' perspective (the rectangle's homography gives
the camera's focal length when the two vanishing points are finite: the standard whiteboard-scanning
method, Zhang and He), falling back to today's sizes when the view is too frontal to solve; then snapped
to a standard paper ratio (A4, Letter, Legal) when within a few percent.

## Acceptance

- [ ] Tests: synthetic rectangles projected by a pinhole camera at several tilts recover their ratio
      within 2%; a frontal view falls back; snapping only when close.
- [ ] Shlomi's three A4 photos come out within 3% of 1.41.

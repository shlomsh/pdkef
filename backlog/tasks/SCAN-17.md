---
id: "SCAN-17"
title: "Scan next: a bent or curled page comes out flat, its edges and text lines straight"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "now"
order: 6
depends_on: []
---

# SCAN-17 · Flatten a bent page, not only a tilted one

*Opened 2026-11-04* from Shlomi's report: a wrinkled or crooked page scans with its lines bowed into a
slight arc.

## Why it happens

`processPage` flattens with one homography from the person's four corners (`lib/homography.ts`,
`lib/warp.ts`). A homography maps straight lines to straight lines, so it fixes a flat page shot at an
angle, and nothing more: a page that bows, curls at a corner or lifts off the table keeps its arcs.

## Outcome

Two classical stages, in the homography's own unit square so the perspective stays exact, composed
into one resample of the photo (no second blur), contract in `lib/dewarp/types.ts`:

1. **Curved edges** (`lib/dewarp/edgeCurves.ts`). Each side of the page is searched along its normal
   for the strongest aligned edge, and fitted as `d(t) = t(1 - t)(a + b t)`: zero at both corners, so
   the person's corners still win. The four curves bend the unit square as a Coons patch.
2. **Text lines** (`lib/dewarp/lineBend.ts`). On the page flattened by stage 1, ink is joined into line
   blobs, each line's centre is sampled across the page, and one smooth vertical bend (cubic across,
   quadratic down) is fitted to all of them at once, with a free height per line.

Each stage is gated: a page with straight edges and straight lines is warped exactly as before (the
plain homography, same bytes), and an implausible fit is dropped rather than applied.

## Not in this ticket

- Corner-editor handles for the curves (the person cannot yet drag an edge's middle). A follow-up if
  real photos show the automatic edge curves miss.
- Horizontal foreshortening across a page that curves in depth (a thick book's gutter): the line model
  straightens lines, it does not stretch the squeezed side.
- The live camera's outline stays a quad.
- A real-photo corpus of bent pages with a KPI, as SCAN-05 has for detection.

## Acceptance

- [x] A flat page and a page with straight text produce the same warp as before.
- [x] Synthetic bowed edges and curved text lines are recovered within the tests' tolerances
      (`dewarp/*.test.ts`).
- [ ] Checked on real photos of a curled page on a phone.

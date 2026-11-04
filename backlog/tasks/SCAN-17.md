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
   blobs, each line's baseline is sampled across the page, and one smooth vertical bend (cubic across,
   quadratic down) is fitted to all of them at once, with a free height per line.

3. **Vertical rules** (`lib/dewarp/columnBend.ts`, added 2026-11-04 from Shlomi's first prod scan of a
   form, where the rows came out straight and the columns did not). A form's table rules are followed
   down the page and fitted with the same shared bend, turned on its side, so their bow and fan go.
   When a page shows both rows and rules (a form), both are also squared, rows level and rules plumb,
   up to 2 degrees; with one direction alone a uniform lean is left to the corners, since it could be
   the page turned as much as skewed. A line's lean is the median of the clean, wide lines' own slopes
   (a form's cell, label and handwriting joined, slopes wherever the handwriting goes). On that scan the
   rules leaned about 6 px per 1000 and bowed up to 4.5 px; re-flattened, they lean about 1.5 px per
   1000 and bow under 1.7 px. The rows are now read with the rules taken out (`lib/dewarp/ink.ts`), so a
   form's grid no longer joins every row into one shape.

4. **Creases** (2026-11-04, from the same scan: a fold across the middle kinked the left border about
   8 px). The rows' and rules' bends were one polynomial over the page, which can follow a curl but not
   a fold. Following the standard classical recipe for folded pages (text lines and ruled lines as
   constraints, a mesh instead of one curve), each is now a 16 x 16 grid of displacements read
   bilinearly, fitted by least squares with a bending-energy penalty: smooth where the page curls, able
   to turn within a cell where it is creased. Rules are found in fainter ink (a one-pixel line fades
   when the page is shrunk to be measured) and with a pixel of drift allowed, and a rule that steps
   sideways across a gap is split (two tables printed a few pixels apart stay as printed). On that scan
   the left border's travel went from 8 px to 4 (page 1) and 3 (page 2); every other rule is within
   1.4 px. A learned model for folds the lines cannot show is SCAN-19.

Each stage is gated: a page with straight edges and straight lines is warped exactly as before (the
plain homography, same bytes), and an implausible fit is dropped rather than applied.

## Weight and laziness

The code lives only in the lazy `scanPipeline` chunk, which the Scan page imports once the first photo
is in; no other page loads it. It adds about 3.5 KB brotli to the service worker's whole-app install
(MEM-15), which measured 2.91 MB of its 5 MB line after this change (2026-11-04).

## Review fixes (2026-11-04)

A cold review found a flat form bent (a label joined to its underline centred differently on every row);
lines are now read at their baseline through a running median. The returned bend carries no tilt (the
corners own rotation) and is held constant outside the box its lines cover. A point the bend pushes
behind the camera paints white. Each has a test that fails on the first version.

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

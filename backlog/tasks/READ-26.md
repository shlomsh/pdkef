---
id: "READ-26"
title: "The open mark's pencil outline stays clear of the next line on tight text"
status: "done"
priority: "P2"
epic: "highlight-pdf"
depends_on: []
---

# READ-26 · The pencil outline stays clear of the next line

*Filed 2026-11-06.* On tightly set text the open mark's outline (READ-13) sits far enough outside the ink that its
lower edge runs through the line below, so that line reads as struck through. Seen on a two-line Sketch highlight in
the sample paper at a 1280 px viewport. READ-24 keeps the full outline on while a mark's row is open, so it is on
screen for longer.

## Outcome

On tight leading the outline sits between the lines, at any zoom, and the line above and the line below read cleanly.
It stays a hand-drawn pencil line: rough, no glow, and the quieter option wins. It still encloses every band.

## What was measured

The sample paper from SEO-54, 9 pt type on 12.5 pt leading, a two-line Sketch mark, in Chromium. Outside the lamp the page
fits the width, so a viewport width is a zoom (1920 wide caps at the same scale as 1280). "On text" is the share of
points along the pencil's head and foot edges that touch ink.

| Viewport | Scale | Foot to next line's ink | Foot to its x-height | Pencil past the foot, before | After | On text, before | After |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1024 | 1.54 | 3.4 px | 6.8 px | 4.9 to 6.5 px | -0.6 to 1.2 px | 72% foot, 36% head | 0 |
| 1280 | 1.95 | 4.0 px | 8.5 px | 3.9 to 9.6 px | -1.2 to 1.7 px | 51% foot, 43% head | 0 |
| 402 | 0.60 | 1.7 px | 2.9 px | not measured | -0.2 to 0.3 px | not measured | 2% foot, 9% head |

In points the gap holds still: about 2.1 pt to the next line's ink and 4.4 pt to its x-height. At 402 wide the 1.2 px
stroke is 2 pt of page, more than half that white, so it grazes a few letter tips, and the next line still reads cleanly.

**Page points, not screen pixels.** The svg's viewBox is the mark's box in points with `preserveAspectRatio="none"`, so
the padding and rough.js's wobble both scale with the page and keep their place against the text at every zoom. Only the
stroke stays 1.2 CSS px (`non-scaling-stroke`). So zoom was never the cause, and a fix in points holds at every zoom.

**Two causes, not one.** A band's foot is already about halfway to the next line (`bandOf`), so the 4 pt pad started
from there, and rough.js's default `maxRandomnessOffset` of 2 strays up to about 3.4 pt on top of it (simulated over 4000
seeds). That wobble alone can cross all 3.4 pt of white between the lines, so trimming the pad was not enough.

## Decided

- **Everything is a share of the line's height,** the passage's tightest line: side pad 0.09, end pad 0.03, wobble 0.08.
  Fixed points cannot suit 9 pt and 24 pt type alike. On the sample paper the pencil stays in the white, and the side pad
  sits mid word gap.
- **Corners cross.** Shrinking the wobble alone kept the text clear but closed the two passes into one thick line with
  square corners, the crude box READ-13 replaced. The room is only tight across the text, so a stroke along the text now
  runs 0.25 of a line past its corners, through the white, the way a hand draws a box. Strokes across the text stop at
  the corner, because past it they would reach the next line. Five variants were compared on the page; an overrun of 0.45 was busy.
- **Rare strays stay.** Over 150,000 seeds on this geometry, 3 marks strayed past the white, by at most 0.09 pt. That is
  the tip of an ascender, over 2 pt short of the x-height, so the wobble was not cut further for it.
- **An empty band is no line.** An imported highlight can carry a zero-height quad, which would otherwise flatten the outline.
- **One seed for all strokes.** The strokes go to rough.js as one path, so a mark still draws the same outline every time.

## Acceptance

- [x] The gap between a band and the next line is measured on a real paper at three zooms, and recorded here.
- [x] Whether the padding is in page points or screen pixels is checked and recorded here.
- [x] A failing test comes first: on today's numbers the pencil reached 5.15 pt past the foot, against 2.07 pt of white.
- [x] `src/tools/highlight/e2e/mark-outline.spec.js` stays green, unchanged, its "encloses every band" assertion included
      (18 of 18 runs at `--repeat-each=6` on a production build, each mark on a fresh seed).
- [x] A screenshot of a two-line mark on tight text at two zooms shows the next line reading cleanly.

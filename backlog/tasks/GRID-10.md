---
id: "GRID-10"
title: "OptionRow's cells take a tap across the whole 44px track"
status: "done"
priority: "P2"
epic: "polish"
depends_on: ["GRID-09"]
---

# GRID-10 · OptionRow's cells take a tap across the whole 44px track

## Problem

`OptionRow`'s default look is 44px tall including its 3px gutter and 1px border, so each cell measured
36px tall, under the 44px rule in the UX guidelines (§8), and a tap on the gutter did nothing. The row
serves Scan, Split and PDF to Image. Compress's raised look has 44px cells and is not part of this.

## Outcome

Every default-look cell takes a tap across the whole track, with nothing moved: an `::after` on each
option reaches over the gutter and border above and below, half the gap either side, and out to the
track's edge at each end. The raised look keeps its own 44px cells and no `::after`.

## Why not a taller row

Measured in Chromium with every cell at 44px, which makes the track 52px:

| | now | taller |
| --- | --- | --- |
| Split and PDF to Image phone bar, sticky at every scroll position | 52px | 60px |
| Split's first page, top on a phone | 399px | 407px |
| PDF to Image's first page, top on a phone | 642px | 666px |
| Split's Download in the rail, bottom at 1440x900 | 439px | 447px |
| PDF to Image's Download in the rail, bottom at 1440x900 | 688px | 712px |

Nothing stopped fitting, but it spends height on every tool for a target the `::after` gives for free,
and it changes a look that GRID-09 has just settled.

## Verified

At 320 and 390 in Chromium and WebKit: every cell on Split (compact bar), PDF to Image (compact bar and
the rows under it), both also in Hebrew, and Scan (size limit, paper and Look) hits 44px tall and at
least 47px wide, up from 36px tall and 44.5px wide. No cell's box changed size. On Split and PDF to
Image, in both languages and engines, a real touch tap on the top gutter and on the track's outer end
chooses the option there.

Guards: `e2e/cross-tool/option-row.spec.js` and `src/tools/scan/e2e/tap-target.spec.js`, through the new
`hitArea` option of `expectControlsSized`, since a pseudo-element never shows in an element's box.

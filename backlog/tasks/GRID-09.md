---
id: "GRID-09"
title: "One segmented row: hover and dividers in every tool, Compress through OptionRow"
status: "done"
priority: "P2"
epic: "polish"
---

# GRID-09 · One segmented row: hover and dividers in every tool, Compress through OptionRow

## Problem

Compress's level toggle gained hover, press and dividers in its own stylesheet. `OptionRow`, which
serves Scan, Split and PDF to Image, had none of them, and `LevelPicker` was a one-off copy of the same
control: the same markup, the same keyboard logic, its own CSS.

## Outcome

- `OptionRow` has a hairline between unchosen neighbours that steps aside beside the chosen and hovered
  option, a hover tint only where a pointer hovers, a deeper press tint, and fits a 320px phone.
- `LevelPicker` renders through `OptionRow`. Its keyboard logic and option CSS are gone.
- The size shortcuts stay `aria-pressed` buttons, because a typed size leaves none pressed, and they use
  `OptionRow`'s classes on the same track.

## Why the raised look stays a look

Compress keeps its mint track through `look="raised"`: Shlomi chose this from the screenshots on
2026-11-05, over taking one look everywhere. Its cells are 44px tall; the default look's are 36px inside
a 44px track, so dropping the raised look would also have shrunk Compress's touch targets.

A two-option row has no unchosen neighbours, so it never shows a hairline: the chosen option's ring
divides it. Same for a three-option row with the middle one chosen.

## Verified

Every row at 320, 360, 390, 768 and 1280, English and Hebrew where the tool has it, with Split's and PDF
to Image's compact phone bars: no label leaves its cell. The same holds at 320, 360 and 400 under
Arial, DejaVu Sans and Verdana, the proxy for CI's wider Linux font, which is what showed that a cell
must not shrink below its longest word. Guards: `e2e/cross-tool/option-row.spec.js` and
`src/tools/compress/e2e/level-row-fits.spec.js`.

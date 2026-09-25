---
id: "MOBI-37"
title: "Home launcher: recents start level with the demo, dropzone higher"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# MOBI-37 · Home launcher: recents start level with the demo, dropzone higher

## Problem

On the desktop launcher (MOBI-35's reserved two-row layout, `min-width: 1024px and min-height: 561px`)
`.launcher` was `justify-content: flex-end`: the two reserved recents rows sat at the bottom of
`.workspace-launcher` with the free space above them, so the "Choose files" picker landed low in the
cell, below where the demo phone starts. Shlomi asked for the recents thumbnails to start top-aligned
with the demo instead, so the picker sits higher and reads as the dominant call to action rather than
something found after scrolling past empty space.

## Decision

Flip the column to start at the top. `FileDropzone.module.css`'s `.launcher` is
`justify-content: flex-start` (was `flex-end`), so the two reserved recents rows sit first and the
picker sits directly under them; the free space that used to sit above the rows now sits below the
picker. `HomePageLayout.astro`'s `.workspace-launcher` gets `padding-top: 10px` under the same
`min-width: 1024px and min-height: 561px` query, so the first thumbnail's top (10px padding plus the
tile's own 6px padding) lands level with the demo phone's top, which sits on `HeroDemo.module.css`'s
`.stage { padding: 16px 0 }`. The two paddings are coupled: move one and the other has to move with it.
This holds whenever the phone fills its stage's height, which is every common desktop height; on a
screen tall enough for the phone to hit its 360px width cap, the phone centres lower in its stage and
the alignment no longer holds exactly.

## Guard

`e2e/home/launcher-picker-pinned.spec.js` extends its existing checks (picker and recents-list rects
identical from first frame to settled, CLS under 0.005) to also assert the first thumbnail's top equals
the demo phone's top within 1px, and that the picker sits directly under the reserved recents rows.

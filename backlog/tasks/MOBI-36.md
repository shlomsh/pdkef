---
id: "MOBI-36"
title: "Home launcher: tablet picker still moves when recents load"
status: "done"
priority: "P3"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# MOBI-36 · Home launcher: tablet picker still moves when recents load

## Problem

MOBI-35 reserved two recents rows on desktop (`min-width: 1024px and min-height: 561px`) so the picker
and the recents tiles never move after mount, whatever the recents count. The tablet band, 768-1023px
wide, was not touched: at 768x1024 with 5 recents seeded, the picker still moves roughly 210px when the
real tiles replace the one server-rendered placeholder (CLS 0.0247 measured).

## Constraint

`.claude/rules/home-page.md`'s "first screen may grow" invariant applies below 1024px: "The first
screen may grow; it may never be squeezed. ... Six recents in three columns is taller than the
launcher's share of a short screen ... a fixed height has nowhere to put that ... `min-content` on both
edge rows is what makes growth land on the launcher." Below 1024px the first screen is expected to grow
to fit its content rather than reserve fixed rows or scroll internally, unlike the desktop cell
(MOBI-35, which scrolls under `max-height: 560px`) or the reserved-row fix above 1024px. Any fix here
has to grow the screen predictably instead of reserving hidden height for recents that may never load,
which is why MOBI-35's two-row reservation was not simply extended down to 768px.

## Decision

Tablets (768-1023px wide, >=561px tall) now use the same two reserved recents rows as desktop,
top-aligned with the "Choose files" picker right under them, so nothing moves when recents load.
Before: at 768x1024 the picker moved 7px with 1-3 recents and 210px with 4-6, CLS 0.017-0.025 on
portrait tablets, up to 0.074 at 800x600.

Rejected alternative: pinning the picker to the bottom of its cell like phones. That is stable, but at
768x1024 it leaves the dropzone roughly 450px below the tiles, against the MOBI-37 direction that the
dropzone sits high as the main call to action - so it was rejected even though it satisfies the "first
screen may grow, never reserve hidden height" constraint above more literally than the desktop
mechanism does.

The growth constraint is satisfied by tying the reservation to a fixed floor rather than to content:
each reserved row has a floor at a readable tile (`--recent-row-floor`, 144px). The reserved height is the same at first paint whatever the eventual recents count, so
there is nothing left to grow *into* when recents load - growth, where it happens, is decided once by
the viewport, not a frame later by how many recents arrived. Where two floored rows don't fit a given
viewport on desktop, the recents section shrinks to one floored row and scrolls inside itself, so
"Choose files" stays on the first screen (letting the whole cell scroll instead was tried and hid the
picker at <=640px tall even with no recents); on tablets, which have no pinned hero to protect, the first screen
grows instead, consistent with the "first screen may grow" invariant.

Bug found while measuring and fixed in the same change: on desktop between 561 and ~700px tall, the
reserved rows shrank below the tile's content - the preview collapsed to 2px and text clipped at
1280x600. The same floor above fixes this for desktop too.

## Guard

`e2e/home/launcher-picker-pinned.spec.js` gains tablet cases (768x1024, 820x1180, at 1 and 6 recents)
asserting the picker rect and recents-list rect are identical from first frame to settled, plus a
1280x600 case asserting tile previews stay >= 40px with no clipped tile text.

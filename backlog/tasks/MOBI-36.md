---
id: "MOBI-36"
title: "Home launcher: tablet picker still moves when recents load"
status: "open"
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

Not yet made. No solution is prescribed; this ticket is to measure and decide, not to replicate the
desktop mechanism blindly given the growth constraint above.

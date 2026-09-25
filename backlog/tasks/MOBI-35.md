---
id: "MOBI-35"
title: "Home launcher: pin the picker when recents load"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# MOBI-35 · Home launcher: pin the picker when recents load

## Problem

Recents load after mount from `localStorage`; the server renders one placeholder tile. On the desktop
grid, `.workspace-launcher` was `align-self: center`, so a returning visitor with four to six recents
got a second tile row a frame after first paint, and centring split that growth across both ends: the
"Choose files" picker itself moved down by roughly 100px on reload. That is exactly the class of shift
`.claude/rules/home-page.md` already tracked as an accepted residual (0.0133-0.0211 CLS at 1440x900) -
accepted because fixing it looked like it meant reserving two-row height for every visitor to smooth a
transition only returning visitors with four or more files see. Measuring it as a real, visible jump
changed that call.

## Decision

Reserve the recents rows instead of bottom-anchoring the picker. `.workspace-launcher` stretches to
fill its grid row (`align-self: stretch` in `src/layouts/HomePageLayout.astro`, `min-width: 1024px and
min-height: 561px`). Inside it, `FileDropzone.module.css` makes `.launcher` a flex column ending at the
bottom: the recents section is `flex: 0 1 376px` (two 180px rows plus their gap, shrinkable) and the
"Choose files" picker is `flex: 0 0 auto`. `RecentFiles.module.css` gives `.list`
`grid-template-rows: repeat(2, minmax(0, 1fr))`, so two rows are reserved from first paint whatever the
recents count (0-6; the server always renders one placeholder tile, real recents land after mount from
`localStorage`), and each tile is a size container whose preview scales
(`clamp(40px, calc(100cqh - 96px), 84px)`) so two rows fit down to 1024x768 (rows ~170px) and stay
180px from 1440x900 up. The short-desktop `max-height: 560px` block (`align-self: stretch;
overflow-y: auto`) is untouched; it is a different case (the cell scrolls instead of growing) and stays
correct.

## Guard

`e2e/home/launcher-picker-pinned.spec.js`: at 1440x900 and 1280x720, with 1 and 6 recents seeded via
`page.addInitScript`, asserts the picker rect and the recents-list rect are identical from first frame
to settled, and that `PerformanceObserver({type:'layout-shift'})` CLS stays under 0.005 with no
headline/dock overlap; plus a 390x844 picker-only case. A sabotage control (removing the two-row
template) fails it. Measured before/after: 0.0134 -> 0.0000 at 1440x900 (5 recents), 0.0211 -> 0.0000 at
1280x720, 0.0310 -> 0.0000 at 1024x768; at 1280x720 with 5 recents production also slid the picker under
the dock, which is fixed too. Not fixed: tablet (768-1023px) still moves the picker ~210px when 5
recents load (CLS 0.0247) - tracked in MOBI-36, since below 1024px the first screen grows by design
instead of scrolling.

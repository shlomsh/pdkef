---
id: "QUAL-16"
title: "The home hero's first screen overlaps itself in a short desktop window"
status: "done"
priority: "P3"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-19"
---

# QUAL-16 · The first screen overlaps itself in a short desktop window

## Scope and acceptance

Found while fixing the rotated-phone home page (the `max-width: 1023px` half of the same bug). Below
1024px the hero is now `min-height: calc(100svh + 1216svh)` with `min-content` header and dock rows, so
a first screen that does not fit grows and the page scrolls. The desktop hero cannot do that: it is the
pinned element (`position: sticky; height: 100svh`), and every fraction in `ScrollDriver.tsx` is taken
against that exact height, so letting it grow would change the pacing of both stories.

So in a desktop-width window shorter than about 560px the launcher still overflows its own grid cell.
Measured at 1440x400 with six recent documents: the launcher's content is ~275px in a ~206px row and,
because the cell is `align-self: center`, it spills roughly 35px out of each end - up behind the
headline and down behind the tool dock. The short-viewport compaction added with the landscape fix
(`@media (max-height: 560px)` in `HomePageLayout.astro`, `RecentFiles.module.css` and
`FileDropzone.module.css`) applies at desktop widths too and more than halves it: the same viewport
measured -62..517 before the fix and 80..349 after. It does not close it.

Not urgent: a desktop window under 560px tall is rare, and the page is now degraded rather than broken.

**Acceptance.** At 1024x420, 1280x480 and 1440x560, with 0 and with 6 recent documents, the launcher's
rendered content stays inside its grid cell - nothing paints over the headline or the dock - and the
hero is still exactly 100svh with both stories pacing unchanged (`e2e/home/scrollable-hero.spec.js`'s
desktop cases and `e2e/demo/sticky-pin.spec.js` stay green). Likely shapes: let the launcher cell scroll
in the block axis at these heights, or carry the short-viewport compaction further at desktop widths.
An e2e case at a short desktop viewport is part of the fix - there is none today, which is why this
went unnoticed.

## Resolved 2026-09-19

The launcher's own cell absorbs it. `@media (min-width: 1024px) and (max-height: 560px)` in
`HomePageLayout.astro` makes `.workspace-launcher` `align-self: stretch` with `min-height: 0` and
`overflow-y: auto` (plus `overscroll-behavior-block: contain`, so reaching the end of a short launcher
does not chain into the page scroll that drives the demo). Stretch rather than centre is half the fix:
a centred box overflows *both* ends, which is how six recents painted up behind the headline as well as
down through the dock. The hero is untouched - still `position: sticky`, still exactly 100svh, so
`SIGN_END` / `CROSSFADE_START` / `CROSSFADE_END` are unchanged, and the header, dock and demo keep
their positions.

The `min-width: 1024px` bound is load-bearing: below it the hero grows instead, and a nested scroller
there would trap the launcher in a short box rather than let the page grow.

Guarded by `e2e/home/scrollable-hero.spec.js`'s new `short desktop window` describe: 1024x420, 1280x480
and 1440x400 with six recents, asserting that nothing belonging to the launcher paints inside the dock's
or the app bar's band, and that the hero is still sticky at exactly one screen. Because
`getBoundingClientRect` reports layout position and ignores clipping, it cannot tell "scrolled out of
view inside the cell" from "painted over the dock" - so the probe samples `elementFromPoint` across each
band instead. A fourth case is the checked sabotage control: it re-centres the cell and restores
`overflow-y: visible` through a constructable stylesheet (an injected `<style>` is refused - `style-src`
carries no `unsafe-inline`) and asserts the same probe then reports a nonzero count, so the guard is
proven able to fail. Measured before the fix: 71 painted-over sample points at 1440x400, 40 at 1024x420;
zero at both after. The launcher scrolls internally by 18-73px at these sizes and by 0 at 1440x900,
1600x1000 and every mobile viewport.

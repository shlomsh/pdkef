---
paths:
  - "src/pages/index.astro"
  - "src/pages/*/index.astro"
  - "src/layouts/HomePageLayout.astro"
  - "src/components/HeroDemo/**"
  - "src/site-lib/FileDropzone*"
  - "src/site-lib/RecentFiles*"
  - "src/shell/DropzoneEmptyState*"
  - "src/shell/Dropzone.module.css"
  - "src/site-lib/homeWorkspace.ts"
  - "src/site-lib/sampleDocument.ts"
  - "src/components/AppBar.astro"
  - "src/components/FeatureCard.astro"
  - "src/components/CardDecor.astro"
  - "src/data/homeContent.js"
  - "src/styles/homePage.css"
  - "e2e/home/**"
  - "e2e/demo/**"
  - "e2e/card-reveal.spec.js"
---

# Home page (`/`) rules

Loaded when working on the home page, its launcher/demo islands, or their guards. Every rule under
"Layout invariants" fixed a shipped bug, most of them CLS, and each names its guard.

## What the home page is for (it is a router, not a tool)

Google indexes the nine tool routes directly; search traffic lands there. `/`'s job is to turn a
visitor into a tool user, not to be a dropzone wired to one tool, so judge changes on that. The right
answer is often the opposite of a tool page's: screens of story in front of `/sign` fight a visitor who
arrived with intent, while on `/` they are the point. Register: documentation plus a working demo,
never a marketing pitch. That is why the demo sits above the documentation; the four arguments and the
conditions for re-opening it are in `backlog/tasks/DEMO-05.md`.

## Layout invariants

- **One canonical DOM, reshaped by CSS per breakpoint; nothing is re-parented after load.**
  `.home-tour > .home-hero` holds four siblings in mobile reading order (header, launcher, dock, demo
  track) and two `grid-template-areas` arrange them: five columns and three rows on desktop, one column
  and four rows below 1024px. Source order is the mobile order so a screen reader meets the tools before
  a screen-tall story; desktop moves the demo beside the launcher purely by naming areas. The desktop
  grid is full-bleed (`minmax(32px, 1fr)` gutters, two 588px columns, a 40px gap column: the old 1280px
  block to the pixel) rather than a wrapper, because a wrapper would force the demo before the dock in
  the DOM. Tell: a script that re-parents the hero after hydration. It shipped once and was **0.243 of
  a 0.244 CLS**, and it re-entered `astro-island` four times per load; only `@astrojs/preact`'s
  `!element.hasAttribute("ssr")` bail kept that from a second mount.
- **Which element pins differs per breakpoint, by design.** Desktop pins the whole hero
  (`position: sticky`); mobile pins only `.home-frame` after the first screen scrolls away. Both give
  exactly **1116svh** of travel, which `SIGN_END` / `CROSSFADE_START` / `CROSSFADE_END` in
  `ScrollDriver.tsx` are fractions of. `ScrollDriver` finds the live pin by asking which
  `[data-demo-pin]` computes to `sticky` and pairs it with its `[data-demo-track]`; never re-test the
  breakpoint in JS. Re-resolve on resize, or a stale pin reads an unpinned element's `top`.
- **The pin's breakpoint and the layout's breakpoint are one number: 1024px.** The mobile grid is
  `max-width: 1023px`, `homeWorkspace.ts`'s `mobile` matchMedia is `max-width: 1023px` - and the mobile
  pin rules sat in a `max-width: 767px` block for months. In between (a phone in landscape, every tablet
  in portrait) the layout was mobile with no pin under it: `.home-hero` had dropped out of `sticky`,
  `.home-frame` had not entered it, `ScrollDriver` found no `[data-demo-pin]` computing to `sticky`, and
  the unpinned frame kept `height: 100%` of the 1216svh demo row - so `HeroDemo`'s size container made
  `.phone`'s `100cqh` resolve against 4,742px and painted a phone taller than four screens across the
  hero. Anything gated on "is this the mobile layout" belongs at 1023/1024; only genuinely
  phone-width things (the dock's `4.5`-card `flex-basis`, the launcher's single-column padding) go at 767.
- **The first screen may grow; it may never be squeezed.** `.home-hero` is `min-height:
  calc(100svh + 1216svh)` with `min-content` header and dock rows and `1fr` for the launcher, not a hard
  `height`. Six recents in three columns is taller than the launcher's share of a short screen (579px of
  content in a 208px row on a landscape iPhone), and a fixed height has nowhere to put that: the dock -
  a scroll container at these widths, so its automatic minimum size is *zero* - was cut from 111px to
  34px and the overflow painted through it into the demo. `min-content` on both edge rows is what makes
  growth land on the launcher and leaves a screen where everything fits unchanged to the pixel
  (verified at 393x852, 360x640 and 820x1180, CLS 0). `e2e/home/scrollable-hero.spec.js` has always
  asserted this ("deliberately allowed to grow for short screens and text zoom").
- **The desktop hero is the one thing that may not grow, so its launcher cell scrolls instead**
  (QUAL-16). It is the pinned element and `ScrollDriver.tsx`'s fractions are taken against its exact
  100svh, so growing it silently re-paces both stories. Under `min-width: 1024px and max-height: 560px`
  the launcher is `align-self: stretch; min-height: 0; overflow-y: auto` - stretch is half the fix, since
  a centred box overflows *both* ends (six recents painted up behind the headline as well as down
  through the dock). Guard: `e2e/home/scrollable-hero.spec.js`'s `short desktop window` describe, which
  samples `elementFromPoint` rather than rects - `getBoundingClientRect` ignores clipping, so it cannot
  tell "scrolled out of view inside the cell" from "painted over the dock" - and carries a checked
  sabotage control.
- **Landscape is a height problem, so its media queries are height-keyed.** `max-height: 560px` blocks
  in `HomePageLayout.astro`, `RecentFiles.module.css`, `FileDropzone.module.css` and
  `HeroDemo.module.css` compact the headline, the recents tiles, the picker and the dock's tiles; paired
  with `min-width: 700px` they also put the recents on one row and set the demo's caption *beside* the
  document instead of above it, which is the only reason the permission slip fits. Rotating an iPhone
  leaves ~390px of height and ~850px of width: spend the width the screen gained on the height it lost.
  These blocks go **last** in their sheet - every rule re-states one from a `max-width` block at the same
  specificity, and a media query adds none, so source order is all that decides it.
- **The launcher's row is viewport-derived wherever the viewport can hold it.** It is the `1fr` row at
  both breakpoints, so `FileDropzone` arriving cannot change it; at 1024px and up nothing inside it
  moves either (see the recents note below), but below that a tablet can still move (MOBI-36) while a
  phone's screen grows instead. It is *not* a floor: on a screen too short for its content the two
  bullets above take over - below 1024px the row takes its content's height and the first screen grows,
  at 1024px and up the cell scrolls. Read this as "the row never shrinks to its content", not "the row
  is always exactly one viewport's share".
- **`--home-nav-height` is measured at runtime.** `AppBar.astro` is `h-14` plus a `border-b-[0.5px]`
  hairline, so it is 56.5px, not 56px, and `.home-header`'s `padding-top` and the card stack's sticky
  band derive from it. The CSS default `calc(3.5rem + 0.5px)` is exact in real browsers (CLS 0); the
  one-element measurement in `homeWorkspace.ts` only corrects headless Chromium, which rounds the
  hairline up. Hard-coding it left `e2e/card-reveal.spec.js` 0.063px from failing in CI. Guard:
  `e2e/home/nav-height.spec.js`.
- **The first screen is one composed unit; insert nothing into it.** `HomePageLayout.astro`'s
  `.home-hero` grid (see "One canonical DOM" above) holds header, launcher, demo and dock as named
  areas of one 100svh grid, not a wrapper `index.astro` composes; the dock sits in its own `dock` row
  so it reads as a dock and stays on the first screen for the visitor who came for one tool. New
  sections go after `.home-hero`. The dropzone's `min-height: 13rem` (`.dropzone` in
  `Dropzone.module.css`) is the separate floor that keeps first paint from moving the dock while the
  launcher settles.
- **`FileDropzone` is `client:load`, and that directive and its `recents` state are one decision.**
  Server-rendering the launcher is only safe while the first client render reproduces the server markup
  exactly, so `recents` starts as `null` and `localStorage` is read only in the mount effect: Preact
  repairs a hydration mismatch by keeping the server nodes and appending its own, which shipped
  duplicate recent tiles once (`203b204`). Changing either half alone brings it back. Guards with
  checked sabotage controls: `e2e/home/recent-files.spec.js` (shell present with JS disabled) and
  `FileDropzone.test.tsx` (first render shows the starter card and has not called `readRecentFiles`).
  Recent tiles always arrive after mount; the card swap is not a layout shift.
- **The picker tile's shape is the same on every frame.** `FileDropzone.module.css` once collapsed the
  tile from 180px (132px mobile) to a 76px compact row via `.launcher:has([data-home-recents] li:nth-child(3))`; since
  the first frame always renders one fallback item, three or more real recents flipped it a frame later
  (CLS 0.0487 at 3, 0.0785 at 4-6). The compact shape is now unconditional: the tall one was only ever
  reachable by the pre-hydration frame. Measured 0.0000-0.0004 at 0-3 recents after
  (`PerformanceObserver({type:'layout-shift'})`, seeding `pdf-toolkit:workspace:recent-files` via
  `page.addInitScript`).
- **The desktop launcher reserves two recents rows instead of sizing to content (MOBI-35).** Recents
  load after mount from `localStorage` behind one server-rendered placeholder tile; sizing the launcher
  from its own content moved the picker or the tiles a frame later, for any recents count from 0 to 6.
  `.workspace-launcher` stretches to fill its grid row, `FileDropzone` lays it out as a flex column
  ending at the bottom, and `RecentFiles` reserves two grid rows from first paint with each tile's
  preview scaling to fit the row. Tiles land in place and nothing in the launcher moves; do not size the
  recents area from content. Guard: `e2e/home/launcher-picker-pinned.spec.js`. CLS fell from
  0.0134-0.0310 (1440x900, 1280x720, 1024x768) to 0.0000; the tablet band (768-1023px) still moves and
  is tracked in MOBI-36.
- **The demo and the launcher cannot simply swap.** Demo copy must be server-rendered (SEO surface), so
  hiding it after hydration flashes and collapses several screens, and deciding before first paint
  needs an `is:inline` script that CSP cannot hash. If a conditional is wanted, **collapse rather than
  remove**: a class on `<html>` from the bundled script that registers the service worker, driving a
  CSS `max-height`.

## Reveal animations (scroll-driven)

- **Never reveal with an IntersectionObserver what JS first hid.** A single-step scroll (End key,
  scrollbar drag, `scrollIntoView()`) passes through no intersecting frame, so the callback never runs
  and the element stays hidden at full height: FeatureCard's reveal read on `/sign/` as a screen-tall
  blank after "Free for everyone". Derive the state from scroll position with a CSS scroll-driven
  animation (`animation-timeline: view()` behind `@supports`), so the hidden state cannot outlive the
  mechanism that undoes it. Guard: `e2e/card-reveal.spec.js`.
- **`animation-range` reads a bare length as the range *start*.** `entry 0% 15vh` parses as
  `entry 150px` to `entry 100%`, so the reveal ran over ~750px instead of ~150px and body copy parked
  at 35% opacity whenever scrolling stopped mid-range. Write both ends with range names
  (`entry 0% entry 15%`), and remember a scroll-linked animation has no duration: any mid-state must
  pass the contrast floor. `entry` is capped at the scrollport's height, so its percentages are stable
  across card heights; `cover` is not.

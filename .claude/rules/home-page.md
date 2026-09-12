---
paths:
  - "src/pages/index.astro"
  - "src/pages/*/index.astro"
  - "src/layouts/HomePageLayout.astro"
  - "src/components/HeroDemo/**"
  - "src/components/FileDropzone*"
  - "src/components/RecentFiles*"
  - "src/components/DropzoneEmptyState*"
  - "src/components/Dropzone.module.css"
  - "src/components/homeWorkspace.ts"
  - "src/components/sampleDocument.ts"
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
- **The launcher's row is viewport-derived, not content-derived.** It is a `1fr` row inside a
  viewport-height box at both breakpoints, so `FileDropzone` arriving cannot change the row. Content
  inside the row can still move (see the recents note below).
- **`--home-nav-height` is measured at runtime.** `AppBar.astro` is `h-14` plus a `border-b-[0.5px]`
  hairline, so it is 56.5px, not 56px, and `.home-header`'s `padding-top` and the card stack's sticky
  band derive from it. The CSS default `calc(3.5rem + 0.5px)` is exact in real browsers (CLS 0); the
  one-element measurement in `homeWorkspace.ts` only corrects headless Chromium, which rounds the
  hairline up. Hard-coding it left `e2e/card-reveal.spec.js` 0.063px from failing in CI. Guard:
  `e2e/home/nav-height.spec.js`.
- **The first screen is one composed unit; insert nothing into it.** `index.astro` wraps hero,
  dropzone and tool grid in one `min-h-[calc(100svh-3.5rem)]` flex column with `justify-center` and
  pins the grid to the bottom with `mt-auto`, so the grid reads as a dock and stays on the first screen
  for the visitor who came for one tool. New sections go after the wrapper. The dropzone's
  `min-height: 13rem` (`.home-workspace` in `index.astro`, `.dropzone` in `Dropzone.module.css`) is the
  separate floor that keeps first paint from moving the dock while the launcher settles.
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
- **Accepted residual: ~0.02 CLS at 4-6 recents** (0.0211 on the current grid; re-measure if the grid
  changes). The three-column recents grid grows a second row, which moves the picker tile down. Fixing
  it means reserving two-row height for every visitor to smooth a transition only returning visitors
  with four or more files see; rejected. Re-open only on real-user CLS from Search Console / CrUX.
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

---
paths:
  - "src/pages/index.astro"
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

Loaded when working on the home page, its launcher/demo islands, or their guards. The home page is a
router to the tools, not a tool (see "What the home page is for" below). Every bullet under "Layout
invariants" fixed a shipped bug, most of them CLS; do not quietly revert them.

## What the home page is for (it is a router, not a tool)

`/` is not the Sign tool with extra copy around it. Google indexes the nine tool routes directly and
that is where search traffic lands, so the home page's job is to turn a visitor into a *tool user*,
not to be a dropzone wired to one tool. Judge changes to it on that, and note that the answer is often
the opposite of the right answer for a tool page: screens of story in front of `/sign` fight a visitor
who arrived with intent, while on `/` they are the point.

Register matters as much as content. Documentation plus a working demo is the target; a marketing pitch
is not. Showing the thing working, beside material that explains it, is the sweet spot the voice rules
above are trying to protect.

This positioning is the reason the landing demo sits above the documentation rather than below it. The
full reasoning, the four arguments behind it, and the conditions under which it should be re-opened are
recorded in `backlog/tasks/DEMO-05.md`.


## Layout invariants

- **The home page is one canonical DOM that CSS reshapes per breakpoint. Nothing is ever re-parented
  after load.** `.home-tour > .home-hero` holds four siblings in the mobile reading order - header,
  launcher, dock, then the demo track - and two `grid-template-areas` arrange them: five columns and
  three rows on desktop, one column and four rows below 1024px. **Source order is the mobile order on
  purpose**, so a screen reader meets the tools before a screen-tall decorative story; desktop moves
  the demo up beside the launcher purely by naming grid areas. That is why the desktop grid is
  full-bleed (`minmax(32px, 1fr)` gutters around two 588px columns either side of a 40px gap column,
  which is the old 1280px content block to the pixel) rather than a wrapper element: a wrapper would
  force the demo to be a DOM sibling of the launcher and put it back before the dock. This replaced a script
  that moved the hero into the sticky frame after hydration; because the server-rendered HTML was the
  mobile shape, every desktop visitor watched the whole hero jump, and that single re-parent was
  **0.243 of a 0.244 CLS**. If you find yourself writing DOM-moving code to satisfy a breakpoint here,
  that is the bug returning. The shift was never the only cost: moving an island's ancestors
  disconnects and reconnects it, which re-enters `astro-island` and re-runs `start()` (measured at four
  `astro:hydrate` dispatches per desktop load under the old script). Only `@astrojs/preact`'s bail on
  `!element.hasAttribute("ssr")` kept that from becoming a second real mount, which is a thin thing to
  have been relying on.
- **Which element pins differs per breakpoint, and that is inherent, not an accident.** Desktop pins
  the whole hero (`position: sticky`, so the header, launcher, demo and dock hold still together while
  the story scrubs); mobile pins only `.home-frame`, after the first screen has scrolled away. Both
  arrange for exactly **1116svh** of travel, which is what keeps `SIGN_END` / `CROSSFADE_START` /
  `CROSSFADE_END` in `ScrollDriver.tsx` valid - they are fractions of that span. `ScrollDriver` finds
  the live one by asking which `[data-demo-pin]` computes to `position: sticky` and pairing it with the
  matching `[data-demo-track]`, rather than re-testing the breakpoint in JS where it could drift from
  the CSS. Re-resolve on resize; a stale pin reads a now-unpinned element's `top`.
- **The launcher's height is viewport-derived, not content-derived, and that is load-bearing.** It sits
  in a `1fr` row inside a viewport-height box at both breakpoints, so `FileDropzone` arriving cannot
  change the *row's* size. Sizing that row to its content would hand the first paint back to whenever
  the island hydrates. This does not mean content inside that row is immune to shifting once it grows
  past one line of recent files - see the 4-6-recents paragraph below, where the row's own available
  space still lets its content push the picker tile down.
- **`--home-nav-height` is measured at runtime on purpose.** `AppBar.astro`'s bar is an `h-14` row plus
  a `border-b-[0.5px]` hairline, so it renders at 56.5px, not the 56px the utility implies, and both
  `.home-header`'s `padding-top` and the card stack's sticky band derive from it. The CSS default is
  `calc(3.5rem + 0.5px)` so a real browser needs no correction and the page keeps a measured CLS of 0;
  the one-element measurement in `homeWorkspace.ts` only changes anything where rendering disagrees,
  which headless Chromium does by rounding that hairline up to a whole pixel. Hard-coding it instead
  put `e2e/card-reveal.spec.js` 0.063px from failing in CI. `e2e/home/nav-height.spec.js` pins it.
- **The home page's first screen is one composed unit, and inserting anything into it breaks the
  dock.** `index.astro` wraps the hero, the dropzone and the tool grid in a single
  `min-h-[calc(100svh-3.5rem)]` flex column with `justify-center`, and pins the grid to the bottom with
  `mt-auto`. That is deliberate: the grid reads as a macOS dock, and an experienced visitor uses it to
  jump straight to the tool they came for, so it has to stay on the first screen. Anything added
  *inside* that wrapper pushes the dock off the viewport and costs those visitors their shortcut. New
  full-height sections go after the wrapper, not in it. The dropzone's `min-height: 13rem` reservation
  inside it (`.home-workspace` in `index.astro`, and `.dropzone` in `Dropzone.module.css`) is a
  separate, load-bearing thing: it is the floor that keeps the first paint from moving the dock while
  the launcher settles.
- **`FileDropzone` is `client:load`, and the directive and its `recents` state are one decision.** A
  `client:only` island emits no HTML at build time, so the whole launcher - dashed picker tile, "Choose
  files", the starter-document card and its thumbnail - existed only after the Preact bundle had loaded,
  and visibly arrived after the page had painted. Server-rendering it is only safe while the component's
  first client render reproduces the server's markup exactly, which is why `recents` starts as `null`
  ("storage not read yet") and browser storage is read only from the mount effect. Recent files live in
  `localStorage`; no server render can know about them, and Preact repairs a hydration mismatch by
  keeping the server's nodes and *appending* its own, which is how duplicate recent tiles shipped in the
  earlier `client:load` attempt (fixed by `203b204`).
  **Changing either half alone brings that back.** Both halves have their own guard with a checked
  sabotage control: `e2e/home/recent-files.spec.js` renders `/` with JavaScript disabled and asserts the
  shell is in the document, and `FileDropzone.test.tsx` asserts the first render shows the starter card
  and has not called `readRecentFiles`. What server rendering cannot buy is the recent tiles themselves:
  they always arrive after mount, so a returning visitor sees the starter card swapped for their own
  files. The card swap alone is not a layout shift and never was.

  **The picker tile's own shape used to change too, and that is what the "0 with 0 and with 4
  recents" claim this paragraph used to make was missing.** `FileDropzone.module.css` had a
  `.launcher:has([data-home-recents] li:nth-child(3)) > .tile` rule that collapsed the picker from a
  tall 180px/132px dropzone to a 76px compact row once three or more recent files filled a grid row - a
  deliberate, pre-existing design choice, dated well before server-rendering this shell. Server-rendering
  is what made it a CLS bug: `recents` is `null` on every first render (server and client alike, by the
  hydration-match rule above), so the bundled-sample fallback always renders exactly one list item on
  that first frame - the `:has()` selector's tall shape - regardless of what the real cache holds. The
  very next frame, once the mount effect reads real recents, three or more of them flipped the selector
  and the tile visibly collapsed by 104px (180 to 76) right under the visitor's cursor. Measured CLS was
  0.0487 at 3 recents and climbed to 0.0785 at 4-6 (it plateaus past 4 because the compact shape itself
  stops changing). The fix made the compact shape unconditional: since the fallback already guarantees
  at least one item whenever this component isn't in `final` mode, the tall shape was never actually
  reachable by a real visitor to begin with - only by the SSR/pre-hydration frame this component itself
  renders. Removing the `:has()` conditional makes the tile's shape identical across every frame, for
  every recents count from 0 through 6. Confirmed with `measure-cls.mjs`-style instrumentation
  (`new PerformanceObserver({type:'layout-shift'})` seeded via `page.addInitScript` writing
  `pdf-toolkit:workspace:recent-files` before navigation): 0.0000-0.0004 at 0-3 recents after the fix.

  **A second, smaller, and *accepted* source remains at 4-6 recents: ~0.02, unchanged by the tile
  fix.** (Measured 0.0386 on the pre-restructuring `.home-scene` layout, 0.0211 on the current full-bleed
  grid above - re-measure again if that grid changes.) The recents grid is three columns; four to six
  items need a second row that one to three don't, and that row's arrival moves the picker tile (and,
  per measured `LayoutShift` sources, page content below the hero) down by its height - a real position
  change of an element that existed in the prior frame, which is exactly what the Layout Instability API
  counts, unlike the tile's own in-place swap above. Eliminating it outright would mean reserving
  two-row height in the recents grid unconditionally, which - given `.home-workspace`'s `min-height:
  13rem` is already the deliberate floor for the *common* case (see above) - would push that reservation
  to roughly double for every first-time visitor and everyone with fewer than four saved files, to
  smooth a transition only visitors with four or more matter to. That trade was rejected: ~0.02-0.04 is
  comfortably inside Google's "good" CLS band (< 0.1) on its own, the visitor population it affects is
  the smaller, more-invested returning-user segment, and the alternative cost lands on every visitor on
  every load. Re-open this only if real-user CLS on `/` (Search Console / CrUX field data) actually
  shows it, not from this synthetic measurement alone.
- **The demo and the launcher have opposite rendering constraints, so they cannot simply swap.** This
  looks like an easy conditional and is not. Marketing and demo copy must be server-rendered or it stops
  counting as the SEO surface (Part II §1.1), so a demo is always present in the document, and hiding it
  after hydration means a returning visitor watches it flash and then collapse by several screens, which
  is exactly the layout shift the reservation above exists to prevent. Deciding before first paint needs
  a synchronous inline script, and hand-hashing an `is:inline` script for CSP is fragile and breaks
  silently (see the CSP section). If a conditional is genuinely wanted, **collapse rather than remove**:
  a class on `<html>` written by the same bundled script that already registers the service worker,
  driving a CSS `max-height`. That keeps the markup crawlable and the CSP posture intact.

## Reveal animations (card reveal, scroll-driven)

- **Never reveal something with an IntersectionObserver that JS first hid.** An observer only learns
  about states a rendered frame actually passed through, so a single-step scroll - the End key, a
  scrollbar drag, a `scrollIntoView()` - moves an element from below the viewport to above it with no
  intersecting frame in between, and the callback simply never runs. Anything the script hid on the way
  in then stays hidden for good while still occupying its full height. That shipped as FeatureCard's
  card reveal and read on `/sign/` as a screen-tall blank gap after "Free for everyone". A scroll
  listener that re-checks skipped elements patches the symptom; the fix is to stop sampling, and derive
  the state from scroll position instead - a CSS scroll-driven animation (`animation-timeline: view()`)
  behind `@supports`, so the hidden state is the start of an animation that is guaranteed to run and
  cannot outlive the mechanism that undoes it. `e2e/card-reveal.spec.js` pins it.
- **`animation-range` accepts a bare length and silently means something else with it.**
  `entry 0% 15vh` looks like "fade over the first 15vh of entry" and parses as `entry 150px` to
  `entry 100%` - the length is read as the range *start*. The reveal then ran over ~750px instead of
  ~150px, which is invisible in a screenshot of a settled page and only shows up as body copy sitting
  at 35% opacity whenever a visitor stops scrolling mid-range. Write both ends with range names
  (`entry 0% entry 15%`) and remember a scroll-linked animation has no duration of its own: whatever it
  is mid-way through is a state the reader can park on indefinitely, so it must not be one that fails
  the contrast floor. Note also that `entry` is capped at the *scrollport's* height, not the subject's,
  so a percentage of it is stable across cards of very different heights - `cover` is not.


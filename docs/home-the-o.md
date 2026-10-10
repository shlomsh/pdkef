# The O: the home page's scroll story

**Status:** built on the English home page, 2026-09-28 ([DEMO-10](../backlog/tasks/DEMO-10.md)). The
Hebrew home page keeps the founder-story card until its own beat 4 exists
([DEMO-11](../backlog/tasks/DEMO-11.md)).
**Source:** [`src/components/TheO.astro`](../src/components/TheO.astro) (markup, the geometry notes and
the one small script) and [`src/components/theO.css`](../src/components/theO.css). The first prototype,
[`prototypes/home-scroll/the-o/index.html`](../prototypes/home-scroll/the-o/index.html), is kept for
history; the production build has moved well past it.

## Abstract

One ring carries the story. It is the zero in "0 accounts", "0 uploads" and "0 paywalls": plain facts,
not claims. Then it rounds into the O of "Open source" and opens into a plane window for "Works
offline". There the airplane in the airplane-mode toggle takes off, rolls over into a paper plane, the
plane that shares, and lands at the end of the founder's sentence: "Then I wanted to share them." Each
card opens as a circle in a new colour, so the section reads as six posters joined by one shape. The
page's closing heading, "Give it a try.", ends the same way: its stroke is swiped on and its full stop
drops in.

## The six beats

| # | The ring | Big line | Small line |
| --- | --- | --- | --- |
| 1 | the zero | accounts | No account, email, or trial period. |
| 2 | the zero | uploads | Files never leave your device. |
| 3 | the zero | paywalls | Free. No caps, no watermark, no catch. |
| 4 | the O of the word | Open source | Audit the code yourself. Then a link to the code: "Read the code on GitHub". |
| 5 | a plane window in the visitor's own sky | Works offline | Turn on airplane mode and give it a try right now. |
| 6 | (the paper plane lands here) | Then I wanted / to share them. | So I built PDkef. I wanted everyday PDF tools to be free and available to everyone, on any device. |

All copy is `homeContent.theO` in `src/data/homeContent.js`, server-rendered. The ring is the zero
visually; an `sr-only` "0" gives assistive tech the same phrase. Beat 5's line is a call to action: while
the visitor really is offline it reads "You're offline right now. It still works." instead (below).

## Why this one

It says the values as facts a reader can check, in one memorable gesture. It needs no illustration, so
it stays crisp at every size and weighs little. Explored and dropped on 2026-09-27: five built
prototypes and nine sketched directions.

## How it moves

- **The pacing is one table.** [`src/site-lib/theOTimeline.ts`](../src/site-lib/theOTimeline.ts)
  holds every scroll-driven moment in svh (`PACE`) and writes the scroll-timed CSS that TheO.astro
  appends to `theO.css`: the pin's height, the keyframes whose stops are moments in the story, and
  every animation range. Its unit test holds the story's promises: each change into a card takes at
  least a screen, every card rests a screen and a half with its words lit before the next change,
  and the last sentence is up a screen before the plane lands on it.
- **The stage pins for about eighteen screens.** Each change (a colour wipe, a full screen; the ring
  changing shape, 1.2 screens) runs, then the card's words fade in and it rests. The flight takes about two
  and a half screens, and the landed plane rests before the page moves on.
- **The O is kept, then becomes the window.** The night card opens around the O of "Open source",
  which stays the same size and weight inside it. Only once the card is fully open does the O grow
  into the window (its frame thinning as it goes), covered by a night-coloured shade with a pull at
  its foot. The shade rises over a screen as the window finishes, and "Works offline" fades in while
  it rises, as in the first prototype. Airplane mode switches on once the shade is up.
- **Geometry is scrubbed, words are timed.** Every copy of the ring runs the same path keyframes over
  the whole pin (one continuous shape), and each card is a full layer revealed by a `clip-path` circle,
  all driven by scroll position. The words are not scrubbed: once a ring settles, a held beat, then
  its words fade in, as in the original sketch. The scroll sets a cue (`--o-lit`, a registered integer
  animated on the stage with `step-end`) and style queries on the words turn it into a timed
  transition, so a fade always completes. Moving the ring itself on timed cues was tried and dropped:
  a fast scroll stacked the moves up and skipped beats.
- **The finale is a flight.** Once airplane mode has turned on (by scroll), the toggle's own plane,
  the same glyph at the same size and place, takes off on its own layer above the cards, climbs over
  the heading and rolls into a paper plane. The last card opens from that point, the paper plane
  glides over the top, comes down the clear lane at the end of the staggered last sentence and
  touches down on its baseline after "them", with a short flare (a timed cue, `--o-landed`). The
  sentence is always visible before the landing.

The Open source card's link is the one interactive thing in the story. The beats are stacked layers,
so in the scroll version only the link takes a click, and it leaves the tab order (`visibility`)
while its card is not lit, so focus never lands on a link nobody can see. On a short screen it sits
beside its line instead of under it.

## Live details

The one script (bundled, so the CSP hashes it) is progressive enhancement; without it the section is
complete.

- **The sky follows the visitor's clock:** day, golden (around sunrise and sunset) or night with stars
  and a citron moon, from a rough northern mid-latitude model in `src/site-lib/theOSky.ts`.
- **Really offline, the page celebrates it.** While `navigator.onLine` is false, `.the-o` carries
  `data-offline`: the toggle stays on and becomes a badge (a citron ring and sparks), the line swaps to
  "You're offline right now. It still works." and "It still works." pops up in citron with a burst.
  It plays when the window beat is lit; when it happens while that line is on screen, the script marks
  it `now` so it plays at once. That is why the English home page does not also render OfflineProof.

## What makes it crisp

- **One geometry.** Every length comes from the stage's container units and `--R`, the ring's size.
  The ring's shapes are measured from the system font's bold glyphs, so the O lands on the cap height
  and baseline of "Open source". Length ratios use `tan(atan2(a, b))`.
- **The sentence is set against the plane.** The last line is end-aligned to the landing spot and
  trimmed to its baseline (`text-box: trim-end cap alphabetic`), so the plane lands on the line.
- **Colours are tokens:** teal, citron, paper and primary, plus `--color-night` (the window beat) and
  `--color-airplane-mode` (the toggle and its burst only).

## Build contract

- Scroll-driven CSS behind `@supports (animation-timeline: view())` and
  `prefers-reduced-motion: no-preference`; both ends of every `animation-range` carry a range name.
  The still version (reduced motion, or no scroll timelines) stacks the six cards as posters with the
  paper plane already landed, and every word shown.
- The CSS ships inline on the one page that renders it (`theO.css?inline`, minified by the build, plus
  its CSP hash, registered by `HomePageLayout.astro` through `site-lib/inlineStyles.ts`), so the Hebrew page, which shares `HomePageLayout`, carries none of it.
- The story is its own section after `.home-tour`, never inside a card: `position: sticky` dies under
  an ancestor with `overflow`, `transform`, `filter` or `contain` (DEMO-05).
- The layout switches between side by side and stacked at aspect ratio 1:1, a geometry decision
  inside the section, not the 1024px layout breakpoint.

## Hazards found while building it

- **`overflow: hidden` makes a scroll container.** A view timeline inside it never moves: the closing
  card's heading timeline was stuck, so its stroke was printed, never drawn. The card runs the cue on
  its own timeline instead.
- **Safari and hidden back faces.** It ignored `backface-visibility` for the plane's roll and showed
  both faces; the roll is drawn in 2D (squash edge-on, swap faces at that instant).
- **Safari and style queries on pseudo-elements.** It never re-evaluates a style query for a `::before`
  when an animation changes the property it asks about. Query the real element and hand the result to
  the pseudo-element through inherited custom properties.
- **The hero demo's autoplay** looped from its second story back to the first while the demo was
  leaving the screen under this section. `ScrollDriver.tsx` now holds the finished story once the tour
  has been scrolled past.
- **A pinned section sized in `svh` leaves a gap when the browser's own toolbar auto-hides.** Reported
  on a real iPhone (Safari and Chrome, same WebKit engine underneath): scrolling down shrinks the
  toolbar, the visible viewport grows past `.o-stage`/`.o-beat`'s fixed `100svh`, and a bare strip of
  page background shows below the pinned section until scrolling back up lets the reappearing toolbar
  cover it again. `svh` was the right call for the pin's total scroll *distance*
  (`theOTimeline.ts`'s `.o-track`, unaffected), wrong for the box that has to visually fill whatever the
  toolbar currently leaves visible. `100dvh` on `.o-beat`/`.o-stage` tracks the real viewport in both
  directions; the one cost is `--R` (fed by this container's `cqh`) doing a small correlated resize
  while the toolbar itself animates.
- **iOS WebKit got `tan(atan2(length, length))` wrong here.** On a real iPhone (Safari and Chrome,
  same engine) the Open source card's O printed at nearly the zero's size, over its own words. A
  readout on the device showed the scroll timeline was fine (`--o-lit` 4, the ring fully into its O
  pose); the scale was 0.990 x 1.062 where 0.199 x 0.214 was due, and those two keep exactly the
  0.6797 : 0.729 ratio of `--o-sx`/`--o-sy`, so the one wrong input was `--k4` (f4 / R, taken with
  the trig trick): about 1.46 instead of 0.29. Neither Chromium nor desktop WebKit 26.6 reproduces it.
  `TheO.astro`'s script now measures both such ratios from layout (the ring's box is `--R` wide, the
  Open source word is set in `--f4`; the last line in `--f6`, the flight box `--B` wide for
  `--f-land`) and sets `--o-k4`/`--o-f-land`, re-measured on resize; the trig stays as the no-JS
  fallback. Guarded by hand: forcing the fallback to 1.46 reproduces the device's numbers to three
  decimals, and the measured value restores the O.

## Measured

Chromium and WebKit at 1440x900, 559x845, 390x844, 820x1180 and 852x393: no horizontal overflow, no
console errors, every beat's resting pose, the flight and the landing checked frame by frame. Not yet
checked: Firefox (no scroll timelines there, so it gets the still version; its `text-box` fallback
margins need a real look) and RTL, which no page renders yet (DEMO-11). The last two hazards above were
found on a real iPhone; neither reproduces in Chromium or desktop WebKit, so both were diagnosed from
the device's own numbers.

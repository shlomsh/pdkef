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
plane that shares, and lands on a runway under where the story does: "Free for everyone". Each
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
| 6 | (the paper plane lands on the runway under it) | Free for everyone | Everyday PDF tools, on any device. So I built PDkef. |

All copy is `homeContent.theO` in `src/data/homeContent.js`, server-rendered. The ring is the zero
visually; an `sr-only` "0" gives assistive tech the same phrase. Beat 5's line is a call to action: while
the visitor really is offline it reads "You're offline right now. It still works." instead (below).

## Why this one

It says the values as facts a reader can check, in one memorable gesture. It needs no illustration, so
it stays crisp at every size and weighs little. Explored and dropped on 2026-09-27: five built
prototypes and nine sketched directions.

## How it moves

- **The pacing is one table, counted in ticks.** [`src/site-lib/theOTimeline.ts`](../src/site-lib/theOTimeline.ts)
  holds every scroll-driven moment (`PACE`) and writes the scroll-timed CSS that TheO.astro
  appends to `theO.css`: the pin's height, the keyframes whose stops are moments in the story, and
  every animation range. A tick (`TICK`, 12svh) is one notch of a mouse wheel, so the table reads as
  the number of notches each moment costs. Its unit test holds the story's promises.
- **Scroll is the only clock.** A pause is a distance the reader chooses to cross, so it feels the
  same at any scroll speed. The first build paused and faded the words on a timer (up to 1.45s) while
  the shapes followed the finger: on a flick the next card was already opening over half-faded words,
  and on a slow scroll a screen and a half went by with nothing answering (2026-11-12).
- **A card costs about ten ticks, one swipe on a phone.** Five ticks open it, one is held with the
  ring settled, then its words light and it stalls with nothing moving: four ticks on the zeros
  (five on the third, the breath before the turn), six on Open source, which has a link to read.
  The whole story is 100 ticks, about twelve screens.
- **The window is three acts, each alone on the stage.** It forms with its shade down and its
  words light. Two ticks of stillness, then the shade rises over seven ticks, the only thing moving.
  Two more, airplane mode fills over two ticks, two more, and the plane takes off.
- **The flight is the payoff, twenty-five ticks.** The toggle kicks and sends out a ring (a timed
  cue, `--o-off`) as its plane lifts off, growing. It climbs over the heading and rolls a turn and a
  half into paper at its biggest; the last card opens from it as the roll finishes. Then it flies a
  route at one steady speed: over the top of the card, down the far side, round onto a long low
  final, and it touches down on the runway and rolls out, slowing, to park at the far end. The
  parked plane rests seven ticks.
- **The route is a curve through a few points.** `FLIGHT_ROUTES` in `theOTimeline.ts` lists the
  points for a wide card and a narrow one; `flightRoute()` draws a smooth curve through them, times
  it by distance flown and works out the heading, and `theOTimelineCss()` writes one `o-fly` per
  route. Reshaping the approach is moving a point. Left of the toggle the route is measured against
  the room there is (`--f-left`), so the plane stays on the card at any size.
- **The O is kept, then becomes the window.** The night card opens around the O of "Open source",
  which stays the same size and weight inside it. Only once the card is fully open does the O grow
  into the window (its frame thinning as it goes), covered by a night-coloured shade with a pull at
  its foot. "Works offline" lights over the closed window, and the shade rises after it, by itself
  (the first build raised it while the window was still forming, and it passed unnoticed).
- **Geometry is scrubbed, words are timed.** Every copy of the ring runs the same path keyframes over
  the whole pin (one continuous shape), and each card is a full layer revealed by a `clip-path` circle,
  all driven by scroll position. The words are not scrubbed, or they would park half-faded whenever
  scrolling stops: the scroll sets a cue (`--o-lit`, a registered integer animated on the stage with
  `step-end`) one held tick after a ring settles, and style queries on the words turn it into a
  0.3s transition, short enough to finish inside one scroll gesture, so a fade always completes. Moving the ring itself on timed cues was tried and dropped:
  a fast scroll stacked the moves up and skipped beats.
- **The last card is empty sky until the plane is down low.** It opens from the paper plane, the
  runway draws in along the bottom, and the plane comes down through the empty card. The words light
  only once it is low on final, clear of them, two ticks before it touches down (`--o-landed`: nose
  up, three dashes kicked back, one small hop).
- **The last card has the shape of the others: one phrase, one line.** "Free for everyone" in the
  size of the other cards' words, "Everyday PDF tools, on any device. So I built PDkef." under it,
  and the runway along the foot of the card, a strip the width of the content with a dashed citron
  centre line and threshold bars. A narrow screen sets the phrase on two lines so it stays as large
  as the others. Three longer layouts were dropped on 2026-11-12: every one carried the founder's
  sentences in full (five or six lines), which read as a paragraph beside five posters.

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
  its CSP hash, registered by `HomePageLayout.astro` through `components/inlineStyles.ts`), so the Hebrew page, which shares `HomePageLayout`, carries none of it.
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

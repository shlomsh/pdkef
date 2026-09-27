# The O: the home page's scroll story

**Status:** concept chosen 2026-09-27, not built yet. Build ticket: [DEMO-10](../backlog/tasks/DEMO-10.md).
**Prototype:** [`prototypes/home-scroll/the-o/index.html`](../prototypes/home-scroll/the-o/index.html), one
self-contained file with no JavaScript (private preview: https://claude.ai/artifact/G8JaoPHeJNCfeNq5K7wWzF).

## Abstract

One ring is the only thing on screen, and it carries the whole story. It starts as the zero in
"0 accounts", "0 uploads" and "0 paywalls": plain facts, not claims. Then it rounds into the O of
"Open source", opens into a plane window for "Works offline", and finally shrinks and flies to the end
of the founder's sentence to become its full stop: "Then I wanted to share them." Each beat opens as a
circle from the ring's centre in a new colour, so the page reads as six posters joined by one shape.
It is a poster-style section, pinned while you scroll, built with scroll-driven CSS only.

## The six beats

| # | The ring | Big line | Small line | Copy source |
| --- | --- | --- | --- | --- |
| 1 | the zero | accounts | No account, email, or trial period. | FAQ answer |
| 2 | the zero | uploads | Files never leave your device. | founder story pill |
| 3 | the zero | paywalls | Free. No caps, no watermark, no catch. | founder story pill |
| 4 | the O of the word | Open source | Audit the code yourself. | founder story pill |
| 5 | a plane window, blind lifts on sky and a wing | Works offline | Turn on airplane mode and give it a try. It still works. | `worksOffline`, `airplaneModeNotice` |
| 6 | the full stop | Then I wanted to share them. | So I built PDkef. I wanted everyday PDF tools to be free and available to everyone, on any device. | founder story |

"accounts", "uploads" and "paywalls" are single words lifted from the FAQ answers. The ring is the zero
visually; an `sr-only` "0" gives assistive tech the same phrase.

## Why this one

It says the values as facts a reader can check, in one memorable gesture, and it could become PDkef's
mark. It needs no illustration, so it stays crisp at every size, and it weighs almost nothing. Explored
and dropped on 2026-09-27: five built prototypes (kinetic verbs, one sheet of paper, the world changes
around the file, ink in the margins, the sentence as a horizon) and nine sketched directions. The five
builds are in git history before the commit that added this record.

## What makes it crisp

- **One actor, one geometry.** Every length comes from the stage's container units and from `--R`, the
  ring's size, so the ring, the words and every wipe centre agree at any viewport and in any font.
- **The ring is a glyph.** As a zero it is 0.82 as wide as it is tall, with heavier sides. In
  "Open source" it is exactly 0.73em of the word's size (cap height plus a round letter's overshoot),
  because the word's size is a fixed fraction of `--R` too.
- **Hard cuts, never fades.** Each beat is a full layer with its own colours and its own copy of the
  ring, revealed by a `clip-path` circle from the ring's centre.
- **Words come out of the zero.** Each big line is revealed with `clip-path` from the ring's side. Real
  text is never parked at partial opacity.
- **The sentence is set against the dot.** The last line is end-aligned to the dot and trimmed to its
  baseline (`text-box: trim-end cap alphabetic`), so the full stop can never land inside a word, at any
  width, in any font, in either direction.
- **Colours are tokens.** Teal, citron, paper and primary from `global.css`, plus one new night colour
  for the window beat.

## Build contract

- Scroll-driven CSS only, behind `@supports (animation-timeline: view())` and
  `prefers-reduced-motion: no-preference`. Both ends of every `animation-range` carry a range name.
  Only `transform`/`translate`/`scale`, `clip-path`, and `opacity` on decoration animate.
- No JavaScript and no island. All copy is server-rendered static HTML on the SEO surface.
- The still version (reduced motion, or no scroll timelines) is the six beats stacked as posters, each
  ring in its finished shape.
- CLS 0, no horizontal overflow, no external requests.
- `position: sticky` dies under an ancestor with `overflow`, `transform`, `filter` or `contain`
  (DEMO-05), and `FeatureCard` carries `overflow-hidden`: the story is its own section after
  `.home-hero`, never inside a card.
- The layout switches between side-by-side and stacked at aspect ratio 1:1, not at the 1024px layout
  breakpoint. It is a geometry decision inside a self-contained section, so it does not depend on the
  hero's layout mode.

## Open questions before building

1. **Placement and what it replaces.** Beats 1 to 4 and 6 overlap the founder-story card (its three
   pills and paragraph 2), and beat 5 overlaps the offline card. Proposal: The O replaces the
   founder-story card and sits after `.home-hero`; the draft-persistence and offline-install cards stay.
2. **Scroll length.** The prototype pins for 600svh right after the demo's 1116svh. Try 450 to 500svh.
3. **Copy and localization.** The display words need a voice check and `homeContent.js` keys. Beat 4
   only works where "open source" starts with an O: the Hebrew edition needs its own beat 4.
4. **Firefox.** It lacks `text-box` as of the prototype. The fallback margins approximate the baseline
   and need a check in a real Firefox.
5. **Progress indicator.** DEMO-05 pairs story panels with a persistent progress indicator. Decide
   whether six short beats need one.

## Measured on the prototype

Chromium and WebKit at 390x844, 820x1180, 1440x900 and 852x393, plus RTL: CLS 0, no horizontal
overflow, no external requests, no console errors. The whole prototype page is 4.7 KB brotli.

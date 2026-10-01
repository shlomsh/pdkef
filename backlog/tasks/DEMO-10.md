---
id: "DEMO-10"
title: "The O: build the chosen scroll story on the home page"
status: "done"
priority: "P2"
epic: "landing-story-demo"
depends_on: []
---

# DEMO-10 · The O: build the chosen scroll story on the home page

## Scope

Build The O, the scroll story chosen on 2026-09-27: one ring that is the zero in "0 accounts",
"0 uploads" and "0 paywalls", the O of "Open source", a plane window, and the full stop of the
founder's sentence. The concept, the six beats, the design rules and the build contract are in
[docs/home-the-o.md](../../docs/home-the-o.md). The reference build is
`prototypes/home-scroll/the-o/index.html`.

Start by settling the record's open questions: placement (proposed: replace the founder-story card,
after `.home-hero`), scroll length, the display copy and its Hebrew beat 4, the Firefox fallback, and
whether it needs a progress indicator.

## Acceptance

- A static `.astro` section after `.home-hero` with scroll-driven CSS only, no JavaScript and no
  island. All copy is server-rendered from `homeContent.js`.
- Reduced motion, or no scroll timelines, shows the six beats as still posters.
- CLS 0 and no horizontal overflow at 390x844, 820x1180, 1440x900 and 852x393, in Chromium and WebKit,
  plus RTL.
- The full stop lands after the last word at every one of those sizes.
- `npm run test:weight`, `test:csp`, `test:seo` and `test:css` stay green.

## Shipped (2026-09-28)

Built for the English home page: `src/components/TheO.astro` and `theO.css`, in place of the
founder-story card, which the Hebrew page keeps. The record, [docs/home-the-o.md](../../docs/home-the-o.md),
describes what shipped. Where it differs from the acceptance above, by decision during the build:

- **One small bundled script**, progressive enhancement only: the window's sky follows the visitor's
  clock, and a visitor who really is offline gets the celebration (and OfflineProof no longer renders
  on the English home page). Without it the section is complete.
- **The full stop became a paper plane.** The airplane in the window beat takes off, rolls into a paper
  plane and lands on the last line's baseline after "them"; the closing "Give it a try." gets the
  dropped full stop instead.
- **Pacing:** 1340svh, with a rest of about a screen and a half on every card and a slower flight.
- **RTL** is not checked, because no page renders the section in Hebrew yet: split to DEMO-11 with the
  Hebrew beat 4 and a real Firefox look at the `text-box` fallback.
- `test:weight`, `test:csp`, `test:seo` and `test:css` ran green in `check:push` before landing.


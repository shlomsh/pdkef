---
id: "DEMO-10"
title: "The O: build the chosen scroll story on the home page"
status: "open"
priority: "P2"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Open"
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

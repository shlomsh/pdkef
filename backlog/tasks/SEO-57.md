---
id: "SEO-57"
title: "Pinned notes: people's own words on the home page and on Redact"
status: "done"
priority: "P2"
epic: "search-and-languages"
depends_on: ["SEO-56"]
---

# SEO-57 · Pinned notes on the home page and Redact

Shlomi picked option A of the sketches on 2026-11-06 (https://claude.ai/artifact/1efqy4g2EA4G4zVqtquHV4): handwritten
paper notes pinned to a board, each with the tool and the person's region. Redact gets the same section.

## How it works (Shlomi, 2026-11-06)

- The pages stay static and keep their own caching. A Preact island fetches `GET /api/notes` and renders nothing until
  there are notes, so a page with none looks as it did.
- `api/notes.ts` reads the store at most once an hour: an hour on Vercel's CDN, in the browser, and in a memo inside
  the function. The service worker lets `/api/` through, or its cache-first branch would keep the first answer for good.
- Notes are only what `npm run ratings:approve` put in `rating:notes`: comments with `share: true` that Shlomi picked.
  Anyone can post to the rating endpoint, so nothing unreviewed is served. Each note carries tool, stars, words as
  typed, and a place written out by hand. No name.
- Notes settle in as they scroll into view through `animation-timeline: view()`, never an IntersectionObserver, and
  stay still under reduced motion.

## Done when

- `x-vercel-cache: HIT` on `/api/notes` in production, and a first approved note shows on the home page within the hour.

## Outcome

Approved notes show on the home page and on Redact as handwritten notes pinned to a board, each with its tool and region and no name. MEM-36 replaced the hour-cached `/api/notes` endpoint with a read at build time, so a new approval appears after the next deploy, not within the hour. Confirmed in production on 2026-11-14: the first approved note, from Jharkhand, shows on both pages.

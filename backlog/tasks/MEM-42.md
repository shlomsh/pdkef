---
id: "MEM-42"
title: "The rating board's flags come as one file"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-42 · The rating board's flags come as one file

*Filed 2026-11-11.*

## Why

Vercel bills per request and pauses the Hobby plan at 1M a month ([docs/request-budget.md](../../docs/request-budget.md)).
The rating board drew one flag per note as its own `/flags/XX.svg` image, so a page with nine notes made nine
requests. Measured live 2026-11-11: `/redact/` is 33 requests, 9 of them flags (IN, US, KE, ID, AE, AU, TW, PH, ET).

## What

One sprite for the flags a board shows. `flagSprite` (`src/site-lib/flagSprite.ts`) is a pure function from flag
files to one SVG: a nested cell per flag, side by side, and a `<view id="CODE">` per flag. One pure
function, `flagSpriteOf`, gives both the sprite text and its URL, which carries a 10-hex fingerprint of the
sprite's bytes: `/flags/notes-<hash>.svg`. A prerendered route, `src/pages/flags/[sprite].svg.ts`, publishes it
from the notes every board renders (no notes, no file), and the board passes the same URL to the island, whose
image is `<url>#CODE`. A note whose country has no flag file draws no image (the board passes the codes the
sprite carries). `public/flags/` stays as it is.

Because the name changes whenever the content does, `vercel.json` gives `/flags/(.*)` `Cache-Control: public,
max-age=31536000, immutable`: a browser asks for the sprite once, across every page and visit, instead of
re-checking it (a billed 304) on each page view. The same rule covers the individual `public/flags/XX.svg` files,
which never change in place (they come from the pinned `country-flag-icons`); a flag file that is ever replaced
needs a new name. `scripts/vercel-flags-cache.test.mjs` guards the header.

## Done when

- [ ] One `/flags/` request per page that shows the board.
- [ ] The flags look the same in Chromium and Safari (e2e in both engines).
- [ ] The sprite's name carries a fingerprint of its content, and two note sets with different flags give different names.
- [ ] One request per browser across pages: verified live, a second page view makes no `/flags/` request at all
  (served from the browser's cache, not a 304).
- [ ] Measured live after landing.

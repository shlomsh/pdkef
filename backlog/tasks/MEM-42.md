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
files to one SVG: a nested cell per flag, side by side, and a `<view id="CODE">` per flag. A prerendered
endpoint, `src/pages/flags/notes.svg.ts`, builds it from the notes every board renders. The island's image is
`/flags/notes.svg#CODE`. A note whose country has no flag file draws no image (the board passes the codes the
sprite carries). `public/flags/` stays as it is.

## Done when

- [ ] One `/flags/` request per page that shows the board.
- [ ] The flags look the same in Chromium and Safari (e2e in both engines).
- [ ] Measured live after landing.

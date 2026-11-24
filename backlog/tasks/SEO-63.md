---
id: "SEO-63"
title: "The app rating on every tool page"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
depends_on: ["SEO-61"]
---

# SEO-63 · The app rating on every tool page

Shlomi, 2026-11-24: every tool should carry the rating, for clicks per impression, and not wait for SEO-61's read on
Merge. Boards show all tools' notes on every page (`FILTER_NOTES_BY_TOOL` off) until there is enough volume to split.

## How it works

- `ToolPageLayout` renders `RatingBoard` and the markup itself, so every tool page in every language has both and a new
  one cannot miss them. The `rated` prop, the `rating` slot and the per-page code are gone.
- The markup stays the app's: named PDkef, the site as `url`, the pooled votes.
- `test:seo` fails a rating outside home and tool pages, and a tool page without one when the build has ratings
  (`scripts/ratedPages.mjs`). It failed on the 19 unrated pages before the change.
- The home card's CSS moved to `HomeInformation`, so tool pages do not carry it: dead bytes stay at 7,401.

## Baseline (Search Console, read 2026-11-24)

- Site, 2026-10-26 to 11-22: 1.32K clicks, 31.3K impressions, 4.2% CTR, position 6.9.
- `/redact/`, 2026-10-19 to 11-01 against 11-09 to 11-22: 513 to 448 clicks, CTR 10.1% to 8.7%, position 4.2 to 4.7.
  Its `blur pdf` query: 37 to 68 clicks, CTR 8.5% to 15.2%, position 3.3 to 3.0.
- Review snippets: 5 valid, 0 invalid.

## Done when

- Production: every tool page carries `aggregateRating` on PDkef and the matching visible numbers.
- The Rich Results Test passes on one newly rated page, and indexing is requested for the main ones (Shlomi).
- About four weeks after landing, a Search Console read against the weeks before says what happened to CTR and position.

## Left before landing

- `check-request-count` reads 33 on `/sign/` against 32: the board adds its shared stylesheet to the pages that lacked it.
  Whether to allow it is Shlomi's call.

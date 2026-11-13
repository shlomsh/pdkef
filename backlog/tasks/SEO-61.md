---
id: "SEO-61"
title: "Put the app rating on Merge, English and Hebrew, and read whether stars lift clicks"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
depends_on: ["SEO-58"]
---

# SEO-61 · The app rating on Merge

SEO-58 put one app-wide rating on `/` and `/redact/` and nowhere else (Shlomi, 2026-11-06). On 2026-11-08 Google showed
`5.0 ★★★★★ (23) · Free` on `/redact/` for `blur pdf`, one day after the indexing request, so it accepts the app rating
on a tool page. SEO-58 left open whether to widen it and named `/he/merge/` first: 12.1K impressions at 0.6% CTR under
PDF24's stars (LOC-03). This ticket takes that step for Merge only, then measures before any other tool.

## Scope

- `/merge/` and `/he/merge/` fill the `rating` slot of `ToolPageLayout` with `RatingBoard`, as `redact.astro` does. The
  board's visible `[data-rating]` numbers and the `aggregateRating` markup stay in step, as SEO-58 built them.
- Check how a localized tool page fills the slot, and that the Hebrew board reads in Hebrew (`ratingBoardCount` and
  `ratingBoardInvite` exist per language in `documentationMessages.ts`).
- `RATED_PAGE` in `scripts/verify-seo.js` names the rated pages explicitly, so `test:seo` still fails a rating on any
  other page. Update the SEO-58 note that says "home page and Redact and nowhere else".
- `RatingBoard`'s `tool` prop filters pinned notes by tool: decide whether Merge shows Merge notes only.
- The markup stays the app's (named PDkef, site `url`), the same as Redact, so the pooled votes are not claimed for
  Merge alone.

## Not in scope

Compress and the other tools. They wait on the read below.

## Done when

- Production `/merge/` and `/he/merge/` carry `aggregateRating` on PDkef and the matching visible numbers, and
  `/compress/` carries none.
- Google's Rich Results Test passes on both, and indexing is requested for both (Shlomi).
- A read of Search Console after about four weeks, `/merge/` and `/he/merge/` CTR and position against the weeks
  before, says whether stars lift clicks. If they do, the next ticket picks the next tool by impressions at low CTR;
  if they do not, the rating comes back off those pages.

## Risk to read for

Google's docs do not address an app rating shown on several pages. It accepted one on `/redact/`, but the home page
showed no stars on the brand search. Watch for stars appearing and then dropping.

## Built (2026-11-12, on branch seo-61-merge-rating)

- `merge.astro` and `[locale]/merge.astro` fill the `rating` slot with `RatingBoard` (`tool="merge"`); the Hebrew board
  uses the page's own messages and `locale`. `LocalizedToolLayout` forwards the slot.
- `ToolPageLayout` takes a `rated` prop for the markup instead of `Astro.slots.has('rating')`: a forwarded slot counts
  as filled on every localized page, which put `aggregateRating` on five Hebrew pages in the first build. `test:seo`
  caught it. Redact, Merge and the Hebrew Merge route pass `rated`.
- `RATED_PAGE` in `verify-seo.js` names home, Redact and Merge in any language. Checked on a build: markup and visible
  numbers on `/`, `/redact/`, `/merge/` and `/he/merge/` (4.97 from 38), none on Compress or the other Hebrew pages.
- Merge has one pinned note so far (its own); the board shows it beside the stars. The place in the Hebrew by-line
  is still English, as SEO-58 noted.
- Left to do: deploy, the Rich Results Test on both pages, indexing requests (Shlomi), the Search Console read.

## Live (checked 2026-11-14)

- Shlomi said yes on 2026-11-14 to the rating on Merge. It had already landed on 2026-11-12 (45c4f5b07) and is live.
- Production: `/merge/` and `/he/merge/` carry `aggregateRating` on PDkef (4.98 from 41) with the matching visible
  numbers; `/compress/` carries none.
- Left, Shlomi's: the Rich Results Test on both pages and the indexing requests. Then the Search Console read around
  2026-12-10, four weeks after it went live, against the four weeks before 2026-11-12.

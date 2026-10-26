---
id: "SEO-48"
title: "Ratings carry country and region, and a person may add a comment"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "later"
---

# SEO-48 · Ratings carry country and region, and a person may add a comment

Filed 2026-10-26 from Shlomi's read of the first ratings: 3 votes since SEO-46 shipped on 2026-10-21, all 5 stars,
all Redact, all on 2026-10-23, and nothing to say where they came from or what the person thought.

## Decisions (Shlomi, 2026-10-26)

- Keep a rating's country and region (state, province) when the network gives them. Vercel adds both to every
  request as `x-vercel-ip-country` and `x-vercel-ip-country-region`; the browser sends nothing new for it.
- A person may add a comment after the stars. It is optional and only what they choose to type.
- The page and search markup still show the aggregate from 50 votes (`RATING_MIN_VOTES` unchanged). The aggregate
  covers every vote, never only the high ones: Google's review snippet policy forbids picking.
- The 3 existing votes stay without location. Vercel's request logs carry no location or body, and 2026-10-23 is
  already outside the window `vercel logs` serves (checked 2026-10-26).

## Contract

- Wire (`src/lib/ratingSchema.ts`): `tool_rating` stays `{tool, stars}`. A new `tool_rating_comment` carries
  `{tool, stars, comment}`, the comment trimmed, 1 to 500 characters, sent once after the stars.
- Store (`src/site-lib/ratingStore.ts`): the per-star hash `rating:<tool>` is unchanged. Each rating and each comment
  also appends one JSON record to `rating:entries`, `{tool, stars, day, country?, region?, comment?}`, kept without
  expiry and trimmed to the latest 10,000. Country is two capital letters, region one to three letters or digits;
  anything else is left out. Both count against the existing rating daily cap.
- Read: `npm run ratings:read` prints the counts per tool and the records.

## Done when

- A vote from production lands in `rating:entries` with its country and region, and a comment lands beside it.
- The disclosure in `docs/maintenance-telemetry.md` says what is kept, in plain words.

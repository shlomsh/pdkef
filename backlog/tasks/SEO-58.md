---
id: "SEO-58"
title: "One rating for the whole app in search results"
status: "in_progress"
priority: "P1"
epic: "search-and-languages"
horizon: "now"
depends_on: ["SEO-46"]
---

# SEO-58 · One rating for the whole app

Shlomi, 2026-11-06: the rating in Google results should be for PDkef as a whole, not per tool. With 22 votes across the
tools, the goal is the `★ (n) · Free` row PDF24 has.

## How it works

- `appRating()` pools every tool's votes into one `{average, count}`, read once per build. Two decimals, so 21 fives and
  a four read 4.95, not 5.
- The bar is 10 votes across all tools. It is our own number: Google states no minimum.
- The rating sits on the home page and Redact and nowhere else (Shlomi, 2026-11-06). Other tool pages carry no rating
  line and no `aggregateRating`, so they cannot show stars in search results. `test:seo` fails a rating anywhere else.
- A rated page's `SoftwareApplication` is named PDkef with the site as its `url`, because those are the votes it carries.
  Every other page keeps its own name.
- Both pages show the numbers in a visible `[data-rating]` block. `test:seo` holds it and the markup to each other.
- The home page and Redact show it as a board (`RatingBoard.astro`), because most ratings carry no words (Shlomi): stars,
  the average and "22 ratings from 10 countries", baked in at build time and always there, with notes pinned beside
  them in the layout of the sketch.
- The country count comes from `rating:entries`, which starts at SEO-48, so the earliest votes are not in it.
- Most notes are a vote with no words (Shlomi, 2026-11-06): recent votes pin up as stars, tool, region and country, read
  by `api/notes.ts` in its one hourly read. Variety over repetition: one note per tool and country, newest first. Approved
  words come first. A vote's words are never shown without the approval.
- Vercel gives ISO 3166-2 region codes; `regionName.ts` names them through `iso-3166-2`, used only by the function so no
  page carries that table. A code it does not know, like Taiwan's, shows the country alone. Region names are in English.

## Why this is a judgement call

Sites with stars rate each tool on its own page (read live 2026-11-06). Google asks for a rating of "a specific item", and
PDkef is one, but its docs do not address an app rating on a tool's page, so Google may ignore it.

## Done when

- Production `/` and `/redact/` carry `aggregateRating` on PDkef and the matching visible numbers; `/merge/` carries none.
- Google's Rich Results Test passes on `/redact/` (Shlomi).
- A read of the results after a recrawl says whether stars show; if they do not within a month, decide per tool or keep.

## Notes on the board (2026-11-06)

- Each note carries its country flag, a small sticker beside the place. The SVGs are `public/flags/`, copied from
  `country-flag-icons` (MIT), same origin so CSP is untouched. An approved note keeps the voter's country for this.
- The endpoint reads the newest 12 approved notes and the last 200 votes, once an hour at most, however many exist.
  It keeps one vote per tool and country and four notes per tool, words first, then one from each tool in turn, so a
  busy tool never empties a quiet tool's board. The board shows four.
- The heading is "Free PDF tools, rated by the people who use them" (Shlomi asked for one that serves search and
  conversion, 2026-11-06). It names no single tool because the rating is the whole app's. The Rating dialog keeps its own
  "How did it go?" title.
- Notes are paper-proportioned and each its own size at desktop width, the place sits on its own line beside the flag, and
  the board shares the page's 1080px grid.

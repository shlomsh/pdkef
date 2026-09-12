---
id: "SEO-35"
title: "Merge is an authority fight, not a content fight: add the combine vocabulary, then stop"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-35 · Merge is an authority fight, not a content fight: add the combine vocabulary, then stop

## The decision (2026-09-12)

Google Trends (past 12 months, worldwide) puts `merge pdf` far above every term we target, and we have
6 impressions on it at position 90 (`/merge/` at 36.13, 0 clicks). The reflex is to write more merge
content. The evidence says not to:

- iLovePDF's merge page is thin and ranks first anyway. It ranks on DR 83 and on brand demand
  (half of iLovePDF's Keyword Planner rows are `ilovepdf edit`, `ilovepdf signature`, `i love pdf
  filler`: brand traffic nobody else can take). Content depth is not what the SERP rewards here.
- Trends also shows `blur pdf` flat at zero, and blur is 22 of our 71 clicks. This domain wins where
  Trends cannot see and loses where it can. Merge is the tallest line on the chart.
- `/merge/` already carries the no-limit fact above the tool (SEO-10) and is one of the two
  deliberately unrequested control URLs for SEO-28. It waits for a natural recrawl.

So: **two small edits, no new content, and every remaining hour goes to SEO-03.** Referring domains
are the only lever that moves merge, split and unlock together. The repo sits at 5 stars, below the
10-star gate at openalternative.co and before awesome-selfhosted's release-age gate opens on
2027-01-12 (SEO-03 has the venue list). Do not reopen "expand `/merge/`" until the referring-domain
count in SEO-03 moves.

## Scope

In the `merge` entry of `src/data/tools.js`:

- **Title carries both words as heads, not as a tail.** Keyword Planner's ideas list for pdkef.com
  puts `combine pdf` at 1M to 10M and `combine pdf free` / `combine pdf files free` / `pdf merge free`
  at 100K to 1M; today "combine" appears in the title only after the hyphen. Something like
  `Merge or Combine PDF Files Online Free - No Upload | PDkef`, under 75 characters, "merge" still
  first.
- **h1** mirrors it ("Merge or Combine PDF Files Free: In Your Browser" or the closest phrasing that
  keeps a single h1 and the existing subhead intact).
- Nothing else. The FAQ and `freeNoteLead` already use "combine" naturally.

## Hebrew edition

`/he/merge/` is published against a `sourceHash` of the English entry; the build refuses on a stale
hash. Recompute it (`toolSourceHash`, `src/i18n/localizedTools.ts`), keep it published, add a dated
`reviewNotes` line saying the English title and h1 gained "combine" and the Hebrew wording is
unchanged pending Shlomi's review. The Hebrew title already carries both senses (מיזוג / איחוד), so
likely no Hebrew change is needed; that is his call.

## Acceptance

- Title and h1 on `/merge/` contain both "merge" and "combine"; title under 75 characters; single
  `<h1>`.
- No other copy on `/merge/` changes; no competitor named.
- `npm test`, `npm run typecheck`, then `npm run build && npm run test:seo && npm run test:css &&
  npm run test:weight` green.
- **No indexing request** for `/merge/`: it stays SEO-28's control URL. Read at the 2026-10-08
  refresh together with SEO-10. The verdict this ticket expects is "small or none"; the point of the
  ticket is the decision recorded above, not the copy.

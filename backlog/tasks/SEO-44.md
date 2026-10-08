---
id: "SEO-44"
title: "/split/ ranks 51.6 for a head term that Compress, on the same domain, ranks 9.4 for: find the page-level difference"
status: "open"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
---

# SEO-44 · Split ranks at 79 for "pdf breaker": measure the term, then decide how to move /split/

Filed 2026-10-08 by Shlomi from the `/split/` query table.

## Where it stands (Search Console, 28 days to about 2026-10-06)

- `/split/`: 0 clicks, 157 impressions, average position 51.6.
- Top queries: `pdf breaker` 29 impressions, `unmerge pdf` 19, `split pdf online` 12, `pdf trimmer` 6,
  `pdf extract pages` 5, then single digits. All 0 clicks.
- SEO-39 (same day) put `pdf breaker` at 79 and closed vocabulary work on `/split/`: "at 52 to 60 it is
  an authority problem (SEO-03)". SEO-09 called `pdf breaker` a symptom, not a target.

## Step 1: is it a strong term?

29 impressions at page eight says Google tests us for it, not how many people search it. Before any
page work, a Google Trends read (worldwide, past 12 months) of `pdf breaker` against `split pdf` and
`compress pdf`, recorded here with the date, the same method SEO-21 used for `flatten pdf`.

## Step 2: decide, from the numbers

- If `pdf breaker` is near noise, close this and leave `/split/` to SEO-03.
- If it is a real fraction of `split pdf`, the question is what moves a page from 50 to the first page
  when vocabulary did not (SEO-09, SEO-39): links to `/split/` from SEO-03's venues, internal links
  from `/merge/` (which ranks 7.3) and the home page, and whether the page teaches something a breaker
  page does not. Write the plan here before building.

## Acceptance

- Trends numbers and the decision recorded here.
- If built: the before row (`pdf breaker` 29 at 79, `/split/` 0 / 157 at 51.6) and a 28-day after row.

## 2026-10-08 Trends read (Shlomi's screenshot, worldwide, past 12 months, read off the chart)

| Term | Average | Line |
| --- | --- | --- |
| `compress pdf` | ~78 | 50-100 |
| `split pdf` | ~48 | 28-75 |
| `pdf breaker` | ~3 | 1-8 |
| `unmerge pdf` | ~0 | flat |

**Verdict on step 1:** `pdf breaker` is about 6% of `split pdf`, above flatten's noise floor but not a
target on its own. `unmerge pdf` is noise. The real finding is the head term: `split pdf` is about 60%
of `compress pdf`, and `/split/` sits at 51.6 while `/compress/` sits at 9.4 and `/merge/` at 7.3 on the
same domain. Same domain means same authority, so SEO-39's "authority problem" does not explain the gap
on its own; something about the page does.

## Step 2, re-scoped: what does /compress/ have that /split/ does not

Compare the three pages before changing anything, and write the table here:

- Index and crawl history: first indexed, last crawled (`npm run seo:crawl-staleness`), any canonical or
  duplicate signal in URL Inspection.
- Internal links in: count and anchor text from the home page, other tool pages and content pages.
- External links to each page (Search Console Links report).
- Title, h1 and the first screen: does `/split/` lead with `split pdf` the way `/compress/` leads with its
  query?
- Which queries `/compress/` ranks for in the top 10, and whether `/split/` has a matching section.

Then one change at a time, each with a 28-day read against the before row above.

## 2026-10-08 comparison (built `dist/`, sources, `seo:crawl-staleness`)

| | /split/ | /compress/ | /merge/ |
| --- | --- | --- | --- |
| Visible words | 907 | 1448 | 992 |
| Keyword in title / h1 / first 100 words | 1 / 1 / 3 | 1 / 1 / 3 | 0 / 0 / 1 |
| Pages linking in / total links | 37 / 40 | 34 / 39 | 34 / 34 |
| hreflang cluster, Hebrew page | none | en, he, x-default | en, he, x-default |
| Content page pointing at it | none | `pdf-wont-compress-to-100kb` | none |
| Last crawled | 2026-09-11 | 2026-09-23 | 2026-09-12 |

On-site, `/split/` is at parity or better on title, h1, keyword placement and internal links. The
measured differences: about 37% fewer words than `/compress/`, and no Hebrew page or hreflang cluster,
which both page-one tools have. The findings doc also records that `/merge/` went from 36 to 7.3 with no
change of ours, so part of this is Google re-weighing pages on its own schedule. Which difference
matters is not known; with `/split/` stuck at 52, the cost of trying is low.

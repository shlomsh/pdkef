---
id: "SEO-45"
title: "/merge/ left Google's results on 2026-10-08, the day its new title was crawled: put the old title and H1 back and read it"
status: "blocked"
priority: "P1"
epic: "search-and-languages"
waiting_on: "2026-10-28"
needs: "The 2026-10-28 Search Console read of /merge/ (Queries, Compare, position on)"
---

# SEO-45 · Merge's title and H1 lost the exact phrase it ranked on

Filed 2026-10-14 after Shlomi's Search Console reads of `/merge/`.

## What happened

- `/merge/` stepped from 0-3 impressions a day to 250-330 on 2026-09-26, on page one for `merge pdf online`
  (position 3.7), `merge pdf free` (5.3) and `combine pdf free` (8.9). Google was ranking the page it read on
  2026-09-12, with the title `Merge PDF Online Free - Combine PDFs in Your Browser` (SEO-44).
- Commit `3cdb1f5b` (SEO-35, 2026-09-12 20:11, after that crawl) changed the title to `Merge or Combine PDF Files
  Online Free - No Upload` and the H1 to a "Merge or Combine PDF Files" form. Google never read it until
  Shlomi requested indexing on 2026-10-08 (SEO-39); the crawl was 2026-10-08 11:43.
- 2026-10-01 to 10-07: 1.51K impressions, position 6.7. 2026-10-09 to 10-11: 15 impressions, 0 clicks. Shlomi
  could not find pdkef.com in 12 result pages for `merge pdf free`.

## What was ruled out (2026-10-14)

- URL Inspection: indexed, Google-selected canonical is `/merge/`, crawl allowed, no noindex. Live test: available
  to Google, no enhancements, the smartphone render shows the full page.
- A Googlebot-UA fetch of `/merge/` is byte-identical to a browser fetch. `robots.txt` is open. The 10-07
  `X-Robots-Tag: noindex` rule is on `/sitemap.xml` only.
- `/he/merge/` rose over the same days, but its impressions are Israeli and its queries Hebrew, so Google is not
  swapping the Hebrew URL in for English queries.
- Controls recrawled the same days: `/compress/` (position 9.1 to 8.4) and `/split/` (impressions up, position
  36.6 to 45.2) did not drop. Both SEO-42 edits kept the title's leading phrase and changed only its tail.
  Merge is the only page whose title lead changed, and the only one that disappeared.

## The change

`src/data/tools.js`, Merge entry only: `seoTitle` and `h1` back to the 2026-09-12 values, word for word:
`Merge PDF Online Free - Combine PDFs in Your Browser | PDkef` and `Merge PDF Online Free: Combine Files in Your Browser`.
The description, body, FAQ and `/he/merge/` are untouched, so the experiment has one variable.

## Honest limits

Three pages and one change; circumstantial. A temporary lift that ended on its own would look the same and
would not come back. The body and the tool changed since 09-12 too, and MERGE-22 (2026-10-12, after the
10-08 crawl) changed step 1 to "Add your PDFs and photos" and added a photos FAQ, so the next crawl reads
that alongside the restored title. Kept: it is product copy, not a ranking edit.

Nothing else on `/merge/` changes until the 10-28 read. No other page has a title lead changed since its
last crawl (checked 2026-10-14 against every `seoTitle`/`h1` edit since 08-20).

That held for the copy but not the layout: HERO-02/03 landed on 2026-10-15, before the recrawl, so Google read
the restored title together with the full-height first screen, Merge's acted-out sheet, and the H1 split into
`data-hero-name` / `data-hero-rest` spans (same H1 text byte for byte). The 10-28 read covers both.

## Second hypothesis: Google's September 2026 spam update (added 2026-10-22)

Search Engine Roundtable reported phase two of the September 2026 spam update hitting on 2026-09-30, and
a later headline asked whether its final phase ran 2026-10-04 to 10-06 (unconfirmed by Google). `/merge/`
fell on 10-08/09, two to four days after that window, so the drop may be the update's doing and not
the title's. Nothing here confirms it; it is a second reading for the same data.

Shlomi's reads on 2026-10-22, from Search Console:

- **`/merge/`, all queries, 28 days** (2.87K impressions, 14 clicks, position 7.5 overall): near zero every
  day from 10-09 to 10-20, on every query, not only `merge pdf online`. Seven days past the 10-15 recrawl
  of the restored title, nothing came back. The page is out of the results entirely, not demoted on one
  phrase.
- **The whole domain, daily, 09-01 to 10-12** (19.1K impressions, 689 clicks): no dip in the 10-04 to
  10-06 window. Impressions peaked around 10-07/08, dipped 10-09/10, and were back above the peak by
  10-12. The rest of the site recovered; `/merge/` did not.
- **Security & Manual Actions:** empty.

What would tell the two apart at the 10-28 read:

- **The title:** `/merge/` comes back within a couple of weeks of the 10-15 recrawl, on its old queries.
- **The spam update:** `/merge/` stays out on every query while the rest of the domain holds or grows. A
  spam-system demotion of one URL does not lift on a recrawl; it lifts when the system re-evaluates the
  page, which can take months and is not something a title change controls. If that is the reading,
  the next step is to look at what on `/merge/` could look like scaled or keyword-stuffed (the merge and
  combine phrasings repeated across title, H1, steps and FAQ, the MERGE-22 photos FAQ) against
  `/compress/` and `/split/`, which were not hit.

## Acceptance

- [x] Deployed (`ebdd1f9c`, CI green, live title checked 2026-10-14); `/merge/` requested for indexing by Shlomi 2026-10-14
- [x] Crawl date after the deploy confirmed in URL Inspection, and the indexed title matches the live one (2026-10-20: last crawl 2026-10-15 12:40, Googlebot smartphone, indexed, Google-selected canonical `/merge/`; the crawled HTML carries the restored title and build `8dc1b5b`, which contains `670c17f7` and HERO-02/03)
- [ ] 2026-10-28 read: `merge pdf online` and `merge pdf free` impressions and position on `/merge/`, 10-day windows before and after the recrawl, plus `/merge/` on all queries and the domain total over the same windows (to tell the title from the spam update)
- [ ] Outcome recorded in `docs/seo-competitive-findings.md`: back on page one (the lead phrase matters, so keep Merge's vocabulary in the body and never in the title lead), or still gone while the domain holds (the spam-update reading: look at what on `/merge/` differs from `/compress/` and `/split/`)

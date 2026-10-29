---
id: "SEO-45"
title: "/merge/ left Google's results on 2026-10-08, the day its new title was crawled: put the old title and H1 back and read it"
status: "done"
priority: "P1"
epic: "search-and-languages"
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

## Revised read, 2026-10-22: a head-term test that ended, not a penalty

Shlomi's Search Console export, the whole property, 10-07 to 10-20 against 09-23 to 10-06 (two 14-day
windows; query rows are capped at 1,000, so query sums are lower bounds).

**The property looks flat and is not.** 9.22K impressions against 9.33K, 309 clicks against 319. Israel
tripled (1,333 to 4,271 impressions, position 15.7 to 9.0, 16 to 33 clicks) and hid the rest: outside
Israel, impressions fell 38% (about 8,000 to 4,950) and clicks 9% (303 to 276). United States 1,556 to 684,
United Kingdom 460 to 232, Indonesia 541 to 283, India 2,111 to 1,626.

**By page, after against before:**

| Page | Impressions | Clicks | Position |
| --- | --- | --- | --- |
| `/merge/` | 352 / 2,515 | 2 / 12 | 9.8 / 7.1 |
| `/redact/` | 3,320 / 3,834 | 247 / 259 | 4.8 / 5.6 |
| `/compress/` | 451 / 901 | 18 / 28 | 8.6 / 9.5 |
| `/compress-image/` | 350 / 57 | 5 / 2 | 8.6 / 9.2 |
| `/sign/` | 106 / 218 | 0 / 1 | 7.4 / 9.2 |
| `/unlock/` | 71 / 185 | 0 / 0 | 45.2 / 12.0 |
| `/split/` | 195 / 171 | 2 / 0 | 37.1 / 47.3 (zero a day from about 10-17) |
| `/he/merge/` | 3,680 / 861 | 16 / 6 | 7.9 / 11.5 |

By query family (English): merge/combine 2,369 to 305, sign 104 to 6, unlock/password 159 to 22, while
compress 469 to 427 and blur/redact 2,043 to 1,651 held their positions (`blur pdf` 5.5 to 4.6).

What this says:

- **Merge's page one was a sample, not a ranking.** `merge pdf online` had 573 impressions in 14 days at
  position 5.0, about 40 a day, on a family Keyword Planner puts at 1M-10M a month (`combine pdf`, findings
  doc section 2). A page holding position 5 there would see thousands a day. Google was showing `/merge/`
  in a sliver of searches and stopped on 10-08; Split's sliver ended about 10-13, Sign's and Unlock's in
  the same weeks. What was lost is about 2,160 impressions and 10 clicks per two weeks.
- **It is not a site-level demotion.** Merge is about 2,160 of the roughly 3,050 impressions lost outside
  Israel. Redact and Compress lost volume at the same or better positions, which is demand or fewer variant
  queries, not rank. A spam-system or quality demotion would have moved those positions too, so the
  spam-update reading above is weaker than it looked when it was added.
- **It is not the recrawl or the HTML Google read on it.** `/sign/` (last crawled 09-19) and `/unlock/`
  (09-16) dropped without a recrawl; `/redact/` was recrawled 10-08 and held (crawl dates from the 10-14
  capture in `docs/seo-last-crawled.json`).
- **It is not a swap to `/he/merge/`.** Israel's 4,271 impressions are about the sum of the `/he/` pages
  (`/he/merge/` 3,680, `/he/compress/` 315, `/he/sign/` 122, the guides), so the Hebrew rise is Israeli
  demand. It began the day `/he/merge/` was recrawled under the title that added `איחוד` (LOC-03), the one
  title change this window shows working.
- **Three tools are not in Google at all.** The same capture has `/pdf-to-image/`, `/image-to-pdf/` and
  `/edit-pdf/` never crawled. Low crawl priority and a head-term test that ended are the same signal:
  authority, which is SEO-03, not anything in this repo.

For the 10-28 read: expect `/merge/` not to return on the head terms whatever the title. A return would
mean a new test, not a verdict on the title. Read it against the domain outside Israel, not the property
total. Head-term title tests are unreadable while those pages are not ranking (SEO-42 has the same
problem, plus its own confound).

## Read, 2026-10-29: not the title

Shlomi's two Search Console exports, 10-16 to 10-25 against 10-05 to 10-14 (the restored title was crawled
10-15), one filtered to `/merge/`, one the whole property.

**`/merge/`:** 818 impressions and 4 clicks before (position 7.6), 24 and 0 after. Twelve of the 24 are the
brand query `pdkef` (position 1.9); no other query shows. `merge pdf online` 163 to 0 (was 3.7), `merge pdf
free` 165 to 0 (was 5.4), `merge pdf` 91 to 0, `pdf merge online free` 31 to 0. The before window still
carries 10-05 to 10-08, the last days before the drop. The daily export for 10-21 to 10-27 is 0 to 9
impressions a day.

**The domain:** 7,506 to 6,886 impressions, 250 to 292 clicks, position 8.6 to 6.8.

| Slice | Impressions before / after | Clicks before / after |
| --- | --- | --- |
| Whole property | 7,506 / 6,886 | 250 / 292 |
| Israel | 2,985 / 3,198 | 22 / 24 |
| Outside Israel | 4,521 / 3,688 | 228 / 268 |
| Outside Israel, without `/merge/` | 3,708 / 3,665 | 224 / 268 |

By page: `/redact/` 2,658 to 2,715 (201 to 233 clicks, position 5.2 to 4.1), `/compress/` 414 to 474,
`/he/merge/` 2,534 to 2,808, `/split/` 251 to 33.

What this says:

- **The title reading is out.** Ten days after Google read the restored title, `/merge/` is on none of its
  old queries, not even at the deep positions where it used to collect single impressions.
- **The domain holds outside Israel.** Without `/merge/`, impressions are flat (-1%), clicks are up 20% and
  the average position improved. Whatever took `/merge/` out did not touch the rest of the site.
- **It is shown for its brand and nothing else.** An unranked page still collects stray impressions at
  position 20 to 80, as `/merge/` did before. Indexed, canonical, and shown only for `pdkef` reads like a
  page-level filter more than a test that ended. That is inferred, not proven: two windows of ten days.
  `/split/` went the same way (251 to 33).
- **Next, per this ticket's plan:** compare what `/merge/` and `/split/` carry against `/compress/` and
  `/redact/`, which held, for anything a quality system could read as scaled or keyword-stuffed (merge and
  combine phrasings repeated across title, H1, steps and FAQ; the MERGE-22 photos FAQ). Not started; it
  needs its own ticket.

## Acceptance

- [x] Deployed (`ebdd1f9c`, CI green, live title checked 2026-10-14); `/merge/` requested for indexing by Shlomi 2026-10-14
- [x] Crawl date after the deploy confirmed in URL Inspection, and the indexed title matches the live one (2026-10-20: last crawl 2026-10-15 12:40, Googlebot smartphone, indexed, Google-selected canonical `/merge/`; the crawled HTML carries the restored title and build `8dc1b5b`, which contains `670c17f7` and HERO-02/03)
- [x] 2026-10-28 read (done 2026-10-29, above): `merge pdf online` and `merge pdf free` impressions and position on `/merge/`, 10-day windows before and after the recrawl, plus `/merge/` on all queries and the domain total over the same windows (to tell the title from the spam update)
- [x] Outcome recorded in `docs/seo-competitive-findings.md` (2026-10-29: still gone while the domain holds): back on page one (the lead phrase matters, so keep Merge's vocabulary in the body and never in the title lead), or still gone while the domain holds (the spam-update reading: look at what on `/merge/` differs from `/compress/` and `/split/`)

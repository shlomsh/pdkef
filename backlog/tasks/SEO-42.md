---
id: "SEO-42"
title: "Read 2026-11-06 · Title test: \"No Upload\" in the Split and Compress titles, read per query in Search Console"
status: "blocked"
priority: "P2"
epic: "search-and-languages"
waiting_on: "2026-11-06"
needs: "The /compress/ query export (28 days before and after 2026-10-08) and /compress-image/ filtered to queries containing pdf"
---

# SEO-42 · Title test: "No Upload" in the Split and Compress titles

Filed 2026-10-08 from a read of ihatepdf.cv, a client-side competitor.

## Finding

Our privacy vocabulary already matches theirs ("no upload", "offline", "never leaves your device",
"in your browser"). The difference is placement. They put "No Upload" and "No Sign Up" in the title and
h1 of almost every tool page, and "Works offline" in the meta description. Ours lives mostly in body
copy; only Merge's `seoTitle` carries "No Upload" (`src/data/tools.js`).

## Scope

- Change the `seoTitle` of Split and Compress to carry "No Upload", keeping the primary keyword first and
  the title under about 60 characters. Leave the h1 alone unless the title change reads wrong without it.
- Record the date of the change and each page's 28-day impressions, clicks, CTR and average position
  from Search Console just before it, here in this ticket.
- Read again 28 days after deploy. Roll out to the other tool titles only if CTR on the two pages rose
  without position falling; otherwise revert and record why.

## Acceptance

- Both titles changed, `npm run test:seo` passes, before and after numbers recorded here with dates.
- A decision line (roll out, or revert) with the numbers behind it.

## 2026-10-08 progress

- Titles changed (`src/data/tools.js`):
  - Split: `Split PDF Online Free - Extract Pages from PDF | PDkef` to `Split PDF Online Free - Extract Pages, No Upload | PDkef` (55 characters).
  - Compress: `Compress PDF to 100KB Free - Reduce File Size | PDkef` to `Compress PDF to 100KB Free - No Upload, Reduce Size | PDkef` (58 characters).
- Baseline, read by Shlomi 2026-10-08 (28 days, data to about 10-06):
  - `/compress/`: 42 clicks, 1.81K impressions, CTR 2.3%, average position 9.4.
  - `/split/`: 0 clicks, 157 impressions, CTR 0%, average position 51.6.
- `/compress/` is the real test. At 51.6 almost nobody sees Split's title, so its CTR cannot move; its
  title change stays (harmless) but is not read as evidence.
- Previously noted: Search Console keeps 16 months, so the 28 days ending on the deploy date can be read after the fact. Needs Shlomi: for `/split/` and `/compress/`, impressions, clicks, CTR and average position for the 28 days before the deploy date, and the same window 28 days after.

- 2026-10-08: Shlomi requested indexing for `/split/` and `/compress/` in Search Console after the title deploy. The 28-day after-read counts from the first crawl that shows the new titles (check Insights or URL Inspection).

## 2026-10-22: the page totals are confounded, read per query

From the property export in SEO-45 (10-07 to 10-20 against 09-23 to 10-06):

- `/compress/` halved, 901 to 451 impressions and 28 to 18 clicks, while its position improved (9.5 to 8.6)
  and the English compress queries held (469 to 427 impressions, visible rows only). Over the same days
  `/compress-image/` went from 57 to 350. The likeliest reading is that the image page took some of the
  PDF page's queries; it is not confirmed.
- The window also overlaps the head-term test ending across the English tool pages (SEO-45): Merge, Sign,
  Unlock and Split all left the results in these weeks, on titles that did and did not change.
- `/split/` has had zero impressions a day since about 10-17, so its title is not being shown to anyone.

So the 11-06 read cannot use page totals. Read CTR on the same `/compress/` queries (`compress pdf to
100kb`, `compress pdf to 100kb free` and their kin) at matched positions, before and after. In the same
pull, filter Page `/compress-image/` with a query containing `pdf`: if PDF-intent queries are landing there,
that is SEO-19's fold-in question, not this ticket's. Split stays unread.

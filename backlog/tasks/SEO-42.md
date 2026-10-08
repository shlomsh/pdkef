---
id: "SEO-42"
title: "Title test: put \"No Upload\" in the Split and Compress titles and read the result in Search Console"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
needs: "The 28-day Search Console read for /compress/ about 2026-11-06"
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

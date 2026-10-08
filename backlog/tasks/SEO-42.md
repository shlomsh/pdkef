---
id: "SEO-42"
title: "Title test: put \"No Upload\" in the Split and Compress titles and read the result in Search Console"
status: "open"
priority: "P2"
epic: "search-and-languages"
horizon: "next"
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

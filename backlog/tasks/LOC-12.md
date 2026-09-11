---
id: "LOC-12"
title: "Two-month country and language re-check, due 2026-11-12"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-10"]
legacy_state: "Open"
---

# LOC-12 · Two-month country and language re-check, due 2026-11-12

Shlomi asked for this on 2026-09-12, alongside the keep-or-remove decision in [LOC-10](LOC-10.md):
whatever that decision is, re-check the site's main countries two months on and make sure there is no
major shift that should reopen it. This is a decision with a review date, not a door closed.

## Baseline

GSC 2026-09-10 (3 months): India 36 clicks / 813 impressions at 12.66, by a distance. Israel 8 / 20 at
6.65. United States 4 / 360 at 31.97. Then Malaysia, Indonesia, the Philippines, Pakistan. The top-twenty
country list and its language map are in [LOC-11](LOC-11.md); the per-language verdicts are in LOC-01,
LOC-08 and LOC-11.

## What to do

1. Pull GSC by country for the last three months and compare against the baseline. Note any country
   that has entered the top ten or moved by more than 2x in clicks or impressions.
2. Run `npm run seo:refresh` on the export. Its non-Latin query clustering lists any in-language
   queries reaching English pages; report the count per script. (If LOC-10 removed the localized
   pages, the script detection was deliberately kept for this step.)
3. For any country that moved, or any language with a new in-language query cluster: re-run that
   language's Trends and SERP links from LOC-11 (or build them the same way for a new language) and
   score against LOC-11's ROI gate.
4. Indonesia specifically: the position of `/merge/`, `/compress/` and `/sign/` on their English
   queries with `gl=ID`. It is the one language that cleared demand; the field is what would have to
   change.

## Acceptance

- Country table refreshed in the findings doc section 3.3; in-language query count per script noted.
- A one-paragraph verdict here: nothing moved (close, and fold the next check into the regular SEO
  refresh), or a named language clearing both gates (reopen LOC-10 or open a restore ticket from its
  keep-list in reverse).

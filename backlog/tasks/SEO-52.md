---
id: "SEO-52"
title: "/merge/ and /split/ show only for the brand: compare their copy with /compress/ and /redact/, which held"
status: "done"
priority: "P2"
epic: "search-and-languages"
depends_on: ["SEO-45"]
---

# SEO-52 · /merge/ and /split/ show only for the brand: compare their copy with the pages that held

*Filed 2026-10-29* from SEO-45's read.

## Why

- SEO-45's read (10-16 to 10-25 against 10-05 to 10-14): ten days after Google crawled the restored title,
  `/merge/` went from 818 impressions to 24, 12 of them `pdkef`, and no other query. `/split/` went from
  251 to 33. Both are indexed and canonical.
- The rest of the property outside Israel held without `/merge/` (3,708 to 3,665 impressions, 224 to 268
  clicks); `/redact/` (2,658 to 2,715, position 5.2 to 4.1) and `/compress/` (414 to 474) grew.
- A page that is merely unranked still collects stray impressions at positions 20 to 80, as `/merge/` did
  before. Shown only for the brand looks like a page-level quality filter. That is inferred; SEO-45 has the
  numbers.

## The question

What do `/merge/` and `/split/` carry that `/compress/` and `/redact/` do not, that a quality system could
read as scaled or keyword-stuffed? Candidates from SEO-45: the merge and combine phrasings repeated across
title, H1, steps and FAQ; the MERGE-22 photos FAQ; how much of each page is shared template against its own
text.

## Outcome

- A side-by-side of the four pages as Google reads them (built HTML, not the source): the target phrase's
  count and placement, the share of text unique to the page, FAQ length and overlap with the steps.
- A written verdict in `docs/seo-competitive-findings.md`: either one difference stands out and gets a
  single-variable change on `/merge/` (with `/split/` as the untouched control or the second case), or
  nothing does, and the effort goes to SEO-03.
- No copy changes before the comparison is written down. Copy follows the voice guide and
  content-and-copy: teach something true, never thin a page to dodge a filter.

## Acceptance

- [x] The comparison, from `dist/`, for `/merge/`, `/split/`, `/compress/`, `/redact/` (taken from the live HTML
      instead, which is main's build and what Google fetches)
- [x] Verdict and next step recorded in `docs/seo-competitive-findings.md`, with Shlomi's OK before any copy
      change (no copy change proposed)

## Comparison (2026-10-30)

The four pages fetched once from pdkef.com and measured by a script over the HTML a crawler reads: scripts,
styles, `<noscript>`, `<template>`, dialogs and `hidden` elements removed. Header is the tool hero, main content
runs from the hero to the footer, and main body is main content without the FAQ and the "More PDF tools" list.

| | `/merge/` | `/split/` | `/compress/` | `/redact/` |
| --- | --- | --- | --- | --- |
| Target phrases per 100 main-body words | 2.71 | 4.63 | 2.72 | 2.65 |
| Main-content words, without More PDF tools | 668 | 635 | 965 | 1,130 |
| Main-body words | 258 | 281 | 367 | 415 |
| FAQ questions / answer words | 8 / 343 | 8 / 278 | 9 / 518 | 10 / 608 |
| FAQ-to-steps overlap, max trigram Jaccard | 0.022 | 0.014 | 0.027 | 0.185 |
| Main-content sentences unique to the page, by words | 81.3% | 82.7% | 90.2% | 91.2% |
| Visible FAQ matches JSON-LD | 8 of 8 | 8 of 8 | 9 of 9 | 10 of 10 |

Phrases: merge, combine, join; split, extract, separate; compress, reduce, smaller; redact, black out, blur.
Stems, case-insensitive. Each page has one `<h1>` and one ordered steps list.

- **Phrase use does not separate them.** `/merge/` sits with the two that held; `/split/` is higher, mostly in
  its body copy (seven "split" and three each of "extract" and "separate").
- **The FAQs do not repeat the steps** on any page; `/redact/`, which held, overlaps most.
- **The shared template is the same on all four** (airplane mode, open source, offline install). The lower
  unique share on `/merge/` and `/split/` is that fixed template over fewer words of their own, the measure
  SEO-06 already found does not discriminate.
- **Length is the one consistent separator:** the two that dropped are the two shortest. It is not the cause of a
  change: `/merge/` reached page one in early October at about this length, and its copy only grew before the
  drop (MERGE-22's photos FAQ on 10-12). `/split/`'s last copy change was 10-08 (SEO-42, SEO-44), and `/compress/`
  took the same "No Upload" title that day and held.
- Both `/merge/` and `/split/` say "Files never leave your device." and "Your files never leave your device." on
  one page; the other two say it once. Too small to read as a cause.
- The MERGE-22 photos FAQ is two true sentences ("Can I merge photos with PDFs?").

**Verdict:** nothing in the copy stands out, so there is no single-variable change to make. Thickening
`/merge/` and `/split/` to match the longer pages would be writing to a filter, which the voice guide rules
out. The effort goes to SEO-03, and the 2026-11-07 read (SEO-40, SEO-44) shows whether the two pages
come back on their own, as Google's earlier tests of `/merge/` came and went (section 2 of the findings doc).

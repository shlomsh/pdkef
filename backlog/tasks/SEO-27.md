---
id: "SEO-27"
title: "Decide the localization question: Hebrew is nearly free, Hindi is not the win it looks like"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-01"]
legacy_state: "Open"
---

# SEO-27 · Decide the localization question: Hebrew is nearly free, Hindi is not the win it looks like

## Scope and acceptance

**India is the top country by a wide margin - 813 impressions, 36 clicks, position 12.66 - which makes a
Hindi edition of the site look like an obvious move. The query data says otherwise, and the reasoning is
worth recording before someone spends a month on it.**

**Every query bringing Indian traffic here is in English.** `compress pdf to 100kb`,
`file compressor to 100kb`, `blur pdf online`, `how to sign a pdf on android`. Not one of the top 200
queries is in Devanagari. That matches how this category is searched in India generally: technical and
tool-shaped queries are typed in English even by people who would rather read Hindi. A Hindi edition would
be competing for a much smaller query set, and it would be competing there as a translated page rather
than a native one.

**On whether Google penalises it.** Localised pages with correct `hreflang` are not penalised as such; the
risk is specifically thin or machine-translated content at scale, which Google's scaled-content-abuse
policy targets directly. This repo is already built to avoid exactly that: `src/content.config.ts`
requires a published localised page to carry `reviewer`, `reviewedAt` and `reviewNotes`, and a
`sourceHash` that ties it to the English it was translated from. So the honest answer to "will Hindi hurt
us" is: not if a competent native speaker reviews every page, and yes if it is machine-translated to fill
a sitemap. The infrastructure makes the good version possible and the bad version inconvenient, which is
the right way round. **The reason to defer Hindi is return, not risk.**

**Hebrew is the opposite case and is nearly free.** Eight of the site's 70 clicks came from Israel, from
20 impressions - a 40% click-through at position 6.65, the best conversion of any country by a distance.
Eight Hebrew translations already exist in `src/content/localized-pages/he/`, all in `draft`, and the
review requirement is satisfiable in-house. Publishing them is a review pass, not a translation project.
Small absolute numbers, but a real signal and the cheapest localisation available.

**What this ticket decides**, with the evidence recorded either way:

- Whether to publish the eight Hebrew drafts. The default recommendation is yes, subject to the review the
  schema already requires.
- Whether Hindi (or Indonesian, Malay, Tagalog - the next four countries by impressions) is worth doing
  later, and what evidence would change the answer. A concrete trigger is better than an intention: for
  example, non-English queries appearing in the Search Console export at some stated volume.
- Whether the `Translated results` search appearance already showing in the export (7 impressions at
  position 44.71) means Google is machine-translating our pages for some users, and what that implies.

**Acceptance.**

- A decision on the Hebrew drafts, executed if it is yes: reviewer, `reviewedAt` and `reviewNotes`
  populated, `status` flipped to `published`, `sourceHash` verified, and the pages appearing in the
  sitemap through the existing published-only filter.
- A recorded decision on Hindi with the query evidence above, and a stated trigger that would reopen it.
- `hreflang` and canonical correctness verified for anything published; `npm run test:seo` passes.
- The decision and its reasoning summarised in the findings doc, not only here.

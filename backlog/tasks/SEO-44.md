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

## 2026-10-08 competitor read (English split pages, curl, saved HTML)

| Page | Words | Modes named | Variant pages |
| --- | --- | --- | --- |
| ilovepdf | 448 | custom, fixed and smart ranges, by size, extract all or selected, merge ranges into one | none (extract and remove are separate tools) |
| smallpdf | 706 | scissors, extract specific pages, several PDFs at once | none |
| pdf24 | 822 | pages per PDF, even/odd, halve pages, custom | none |
| sejda | 2263 | every page, every X pages, at chosen pages, discard bookmarks, custom names | by size, by text, by outline, in half, extract |
| ihatepdf.cv | 779 | ranges, single pages, equal sections | by size, in half, by bookmarks, by text |
| pdkef | 914 | ranges, thumbnails, one PDF or one per page | none |

Adobe returned 403. Word count does not separate the ranking pages from ours (ilovepdf ranks on 448).

**What every ranking competitor has and we do not: more than one way to split.** Our tool has exactly
two output modes, one PDF or one per page (`src/tools/split/split.js`). Fixed "every N pages" is on
three of five, by size on three, halve on three, even/odd on one, bookmarks on two. Compress and Merge,
which rank, each have something a searcher recognises (target size, page-level arranging); Split has
the baseline only. Inference: the gap is the tool, then the page that names it.

Code inventory findings, same day: step 4 says "Click Split PDF", but the button reads "Download 1 PDF"
or "Download N PDFs" (`PdfSplitTool.tsx` line 755). Unmentioned strengths: per-page rotate with undo,
output prepared before the tap, Web Share on phones, the Compress hand-off. Bookmarks, form fields and
document details are not carried into the parts (fresh `PDFDocument.create()`; unmeasured).

Variant pages are new URLs, so they wait for the SEO-06 gate. Modes on `/split/` itself do not.

## 2026-10-08 what the two ranking pages actually rank for

- **`/compress/`** (Search Console export, 28 days): 42 clicks / 1,812 impressions at 9.36, almost all on
  `compress pdf to 100kb` and its variants (451 impressions on the top row alone), mostly Indonesia and
  India. Two rows are pasted portal errors ("exceeds the 1024 kb size limit"). `compress pdf` itself has
  no row. Compress owns a specific need, not the head term.
- **`/merge/`** (SEO-39): 11 / 2,216 at 7.3 on head terms, `merge pdf online` 511 at 5.2 and
  `merge pdf free` 377 at 6.7. The climb from 36 came on a title Google held from before 09-12, so not
  from copy. It followed the Merge rebuild (MERGE epic, landed 09-13). Correlation only.
- **`/he/merge/`** (export sent by mistake for `/merge/`, kept): 7 / 849 at 14.3, Israel, position
  30 to 9 between 09-12 and 10-05.
- **"split pdf" SERP** (Shlomi's screenshot, 2026-10-08): iLovePDF, Smallpdf, **ihatepdf.cv at 3** (title
  "Split PDF Online Free - Extract Pages, No Upload"), Jotform, PDF24, PDFAid, Pipefile (in-browser,
  no upload), pdfFiller, PDF.io. A young in-browser site ranks third, so the head term is reachable.

**Reading:** a head term is reachable on this domain (Merge, 5.2), and a niche can be owned outright
(Compress, 100KB). Both point at the tool, not the copy: Split has the baseline only. The candidate that
does both is **split by size**: the same portal-limit audience Compress already serves, a mode three of
five competitors name, and a natural "still too big? split it" hand-off from Compress. Pending: the
Trends read of the split modes.

## 2026-10-08 two corrections from the data

- **Split modes have no search demand.** Trends (Shlomi's screenshot, worldwide, 12 months): `split pdf`
  averages ~64; `split pdf by size`, `in half`, `every page` and `by bookmarks` sit at ~0, with only
  two small blips for `in half`. Split by size is not a demand play. Any mode would be built for the
  person using the tool, not for search.
- **The Merge rebuild did not cause Merge's rank.** `/merge/` export (28 days): zero to three impressions
  a day until 09-25, then 79 on 09-26 and 246-331 a day after, at 6-8, on head terms (`merge pdf online`
  511 at 5.15, `merge pdf free` 377 at 6.69, `combine pdf free` 160 at 8.34). Its last crawl is 09-12
  (`docs/seo-last-crawled.json`), the day before the rebuild landed (09-13). Google ranks a page version
  it read before the rebuild, so the step on 09-26 is Google re-weighing a 09-12 page. `/split/` was read
  on 09-11 and did not step up. CTR at 6-8 is 0.5%, with 706 US impressions and no clicks.

What is still unexplained: two pages read a day apart, one stepped to page one on 09-26 and one did not.
Measurable next: the `/merge/` page as served on 09-12 against `/split/` as served on 09-11 (git), and
whether anything linked to `/merge/` and not `/split/` by then.

- 2026-10-08: indexing requested for `/split/` (Shlomi), after the SEO-42 title deploy.

## 2026-10-08 /merge/ as read on 09-12 against /split/ as read on 09-11 (git)

- Same page wrapper, same sitemap priority and JSON-LD, registry-generated internal links on both;
  `/split/` had more copy (FAQ 7 vs 5, 272 vs 145 words) and two hand-written inbound links `/merge/`
  lacked. On-page, Split was not behind.
- The only structural asymmetry: `/he/merge/` published 09-11 18:03 with reciprocal hreflang
  (en, he, x-default) on `/merge/`; `/split/` has no alternate. Plus one merge-only sentence (SEO-10's
  no-limit line), which SEO-39 found had no demand.
- Nothing in the repo records a Google update or resubmission near 09-26.

**Reading:** most likely Google re-weighing the domain, page by page, on its own schedule. The one lever
left that the data names is the hreflang cluster; a Hebrew `/he/split/` would test it, valued for the
English page's signal, not for Hebrew traffic. Unproven, and LOC rules apply (docs/i18n-status/).

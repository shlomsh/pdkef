---
id: "SEO-39"
title: "The 2026-10-08 Search Console read"
status: "done"
priority: "P1"
epic: "search-and-languages"
depends_on: []
---

# SEO-39 · The 2026-10-08 Search Console read

One dated read replaces seven separate tickets. Everything below is shipped and waiting; nothing is left to build before the read.

## What to export on 2026-10-08

- Performance, three months: queries and pages, with clicks, impressions, CTR and position.
- Pages, Not indexed: the reasons and the URL list.
- AI features: the report as exported.
- Crawl dates: the Coverage Valid export's `Last crawled` column into `docs/seo-last-crawled.json`, then `npm run seo:crawl-staleness`.

Then run `npm run seo:refresh` on the Performance export and record the numbers in the SEO-02 table.

## Checklist, one line per folded ticket

- [x] SEO-09: read the `/split/` extract cluster (`extract pdf`, `pdf extract`, `pdf extractor`, about 92 impressions at position 85 before) after confirming `/split/` was recrawled. Decision: close, or reopen with a finding on the extract vocabulary.
- [x] SEO-10: read `/merge/` on the no-limit queries (`merge pdf online free no limit`), position and CTR against the SEO-02 table. Check its crawl date first: it is an unrequested control URL, so if it is still on its August date decide then whether to request indexing.
- [x] SEO-25: read the CTR effect on the compress-quality cluster after the before-and-after preview (PDF and image modes). Decision: did the preview move CTR, and does it stay as built.
- [x] SEO-28: compare the crawl dates of `/redact/` and `/split/` against the `/merge/` and `/unlock/` controls. Decision by outcome: crawl trust rising on its own (close), recrawl bought by the request (keep watching), or still stale (escalate to Crawl Stats, robots, canonicals and SEO-03). `/unlock/` was edited on 2026-09-19, so it is no longer a clean control.
- [x] SEO-33: read positions on `pdf size reducer`, `shrink pdf size` and `resize pdf` for `/compress/`, alongside SEO-05. Decision: whether the reduce/shrink/resize vocabulary earned anything.
- [x] SEO-34: read `pdf tools` and `free pdf tools` impressions and the home page's position and CTR. Decision: whether targeting `pdf tools` on `/` worked.
- [x] SEO-35: read the combine vocabulary on `/merge/` together with SEO-10. The expected verdict is "small or none"; record it and stop on Merge copy (SEO-16 treats Merge as settled by this).

## Stays separate

SEO-04, SEO-05 and SEO-06 stay separate tickets, because each verdict may spawn work. SEO-17, SEO-18 and LOC-03 get a crawl-state first look at this refresh; their eight-week reads are in SEO-40 and their own tickets.

## The read, 2026-10-08

Exports (Shlomi, 2026-10-08): Performance three months (web, data 07-06 to 10-05), Generative AI
features (same range), Coverage with its reasons, Coverage -> Valid with `Last crawled` (data to 10-04),
a screenshot of the "Discovered - currently not indexed" drilldown, and two Insights screenshots (28
days). Section 3 of the findings doc carries the refreshed tables and the SEO-02 standings row.

**Method.** "Before" is the 2026-09-11 export (three months to 09-08). "After" is 09-09 to 10-05, the
10-08 export minus the 09-11 one, query by query, positions impression-weighted. The two windows share
07-06 to 09-08 exactly, apart from 07-03 to 07-05, when the site had almost no impressions. The 09-11
recrawl of `/redact/` lands two days into the after window. `Queries.csv` stops at 1,000 rows and its
tail is one-impression rows, so a query absent from it had at most one impression. Scratch scripts in
the session scratchpad, not the repo.

**Two instrument fixes on the way.** `seo-refresh.mjs` printed "Queries.csv sums to NaN": this export
carries a query with an embedded newline, quoted, and the parser split on every newline. Fixed test
first (`aa656c2c`). And the Insights "Your content" card turned out to show the title Google holds for
each page, which is the cheapest staleness check there is: it shows `/merge/` and `/he/merge/` with the
titles from before their 09-12 and 09-17 edits (findings doc section 2).

### Checklist

- [x] **SEO-09, `/split/` extract cluster.** `/split/` was recrawled on 09-11, on the request, and not
  since (content changed 09-19, so it is stale again). Extract rows: before 0 clicks / 73 impressions
  at 86.7; after 0 / 18 at 28.2. The head rows (`extract pdf` 32 at 91, `pdf extract` 16 at 83,
  `pdf extractor` 6 at 89) took no impressions at all after 09-08; what replaced them is long tail at
  page three (`pdf extract pages` 5 at 22.8, `extract pages from pdf` 2 at 26). The split family went
  0 / 18 at 75 to 0 / 100 at 58 (`pdf breaker` 29 at 79, `unmerge pdf` 19 at 35). `/split/`: 0 / 204 at
  65.3 before, 0 / 156 at 51.9 after. **Verdict:** the extract vocabulary moved a handful of
  long-tail rows from page nine to page three and earned nothing. **Decision: close.** No further
  vocabulary work on `/split/`; at 52 to 60 it is an authority problem (SEO-03).
- [x] **SEO-10, `/merge/` no-limit queries.** Crawl date first: 09-12, not August, so no request was
  needed then. No-limit demand: two rows in three months, `pdf merge no size limit` (1 at 6) and
  `unlimited merge pdf` (1 at 15); `merge pdf online free no limit` has no row. **Verdict:**
  unmeasurable, there is no demand to read. `/merge/` itself went from 0 / 47 at 36.1 to 11 / 2,216 at
  7.3 (0.5% CTR), on head terms: `merge pdf online` 511 at 5.2 (3 clicks), `merge pdf free` 377 at 6.7
  (1). Insights shows Google holds the title from before 09-12 (`Merge PDF Online Free - Combine PDFs
  in Your Browser`), so this climb happened on a title that already said "Combine", with neither
  SEO-10's no-limit line nor SEO-35's title in a crawl we can date. **Decision: close the no-limit
  question.** `/merge/` is stale (content changed 10-01) and is now the site's second-largest page by
  impressions, so it goes on the reindex list below; it no longer serves as a control (SEO-28 closes).
- [x] **SEO-25, compress-quality CTR.** Two rows: `compress pdf to 100kb with good quality` 0 / 3 at
  9.7 and `... with high quality` 1 / 2 at 17.5. Five impressions in three months. **Verdict:** too
  small to read, and the preview lives inside the island, where no searcher sees it before clicking,
  so CTR was never its instrument. **Decision: close; the preview stays as built** on its product
  value.
- [x] **SEO-28, recrawl of `/redact/` and `/split/` against the controls.** `/redact/` and `/split/`:
  09-11, the request day, and not since (27 days to 10-08). `/merge/` 09-12, unrequested. `/unlock/`,
  the clean control, moved from 08-21 to **09-16 without a request** (26 days). Six pages were
  recrawled unrequested between 09-16 and 09-29 (`/unlock/`, `/sign/`, iPhone guide, `/compress/`, `/`,
  Android guide), and six of the fourteen indexed English pages still sit on their 09-11 or 09-12
  dates. **Verdict: the recrawl of `/redact/` and `/split/` was bought by the request**; since then they
  wait on the same 2-to-4-week organic cadence as everything else. Traffic does not buy crawl priority
  here (`/redact/` has 81% of clicks and, with `/split/`, the oldest crawl date), and nothing on the page explains it
  (SEO-28's own check). **Decision: no escalation;** the lever stays one indexing request per copy
  change, plus SEO-03. `/split/` is left unrequested as the organic-cadence probe for the next refresh;
  `/redact/` gets requested for RED-46.
- [x] **SEO-33, reduce / shrink / resize / size reducer on `/compress/`.** In the index since the 09-23
  crawl at the latest. Head terms: `pdf size reducer`, `shrink pdf size`, `resize pdf`, or any
  reduce/resize/reducer query without a size, have **no row at all**; "shrink" appears in no query.
  With a size target: before 2 / 54 at 8.8, after 1 / 156 at 12.6 (`reduce pdf size to 100kb` 26 at 21.7,
  `resize pdf to 100kb` 10 at 10.1, `pdf size reducer 100 kb` 7 at 13.7). **Verdict:** the vocabulary
  earned no head-term impression; it pulled in kb-target variants at the same page-one boundary as the
  rest of the 100KB cluster, at 0.6% CTR. **Decision: close; the words stay** (true, and harmless), no
  more vocabulary work on `/compress/`.
- [x] **SEO-34, `pdf tools` on `/`.** The home page's indexed title is the targeted one (`Free PDF Tools
  Online - Run on Your Device, No Upload | PDkef` in Insights; crawled 09-28). `pdf tools` and `free pdf
  tools`: no row. `/`: before 11 / 101 at 22.1, after 6 / 46 at 2.3 (13%), which is navigational traffic. **Verdict:** targeting `pdf tools` on
  `/` earned nothing. **Decision: close;** the title stays, `pdf tools` is an authority term (SEO-03).
- [x] **SEO-35, combine vocabulary on `/merge/`.** The expected verdict was "small or none". **It is not
  small:** combine phrasing went from 4 impressions at 79.8 to 551 at 9.2 after (`combine pdf free` 160 at
  8.3, `combine pdf files free` 59 at 12.3, `combine pdf files online` 34 at 4.0, `combine pdf online` 26
  at 1.5), and merge phrasing from 1 to 1,597 at 7.2. **But SEO-35's own edit is not what did it:** the
  title Google holds is the pre-09-12 one, which already carried "Combine". Combine phrasing took 0
  clicks; merge phrasing 11, at 0.7%. **Verdict:** `/merge/` reached page one on its head terms with the
  domain's re-weighting, and it is now a zero-click page at page one, the shape `/redact/` had before
  09-11. SEO-35's title change is unmeasured until `/merge/` is recrawled. **Decision:** stop on Merge
  copy as SEO-35 said; request indexing for `/merge/` so the live title is what searchers see, and read
  its CTR at the next refresh. SEO-16's note that this read settles Merge no longer holds as written:
  Merge is a CTR question at page one now, not an authority wall.

### Also read

- `/sign/` (SEO-07's check): 1 / 42 at 11.6 before, 1 / 226 at 9.2 after (0.4%); crawled 09-19, stale
  since 09-28. No verdict on SEO-07's copy until it is recrawled.
- OS guides (SEO-08): the English device-intent rows at 44 to 59 took no impressions after 09-08; the
  guides now show only on a few rows at page one (iPhone guide 2 / 19 at 7.8 after, Android 0 / 12 at
  8.3, Windows 0 / 15 at 11.0).
- `password protect pdf free`: 81 impressions at 4.09, no clicks. New since 09-08; `/unlock/` is
  page one on it. SEO-16 territory.

### Reindex list for Shlomi, in order (one per day if the quota bites)

1. `/redact/` after RED-46 is deployed: RED-46 plus every change since 09-11 (the 09-17 Blur-first
   reorder, RED-10/12, the 28-day drafts line, SEO-41).
2. `/he/merge/`: the איחוד title (09-17) has never been crawled, and LOC-03's 11-06 read measures it.
3. `/merge/`: page one at 0.5% CTR on a title from before 09-12.
4. `/compress/`: COMP-01 rewrote how the page describes the compressor on 10-02 and 10-03.
Not `/split/` (the organic probe). `/he/sign/`: URL Inspection first, not a request; it was requested on
09-24 and is out of the index.

**Status: done.** Every checklist line has its numbers, verdict and decision. SEO-04, SEO-05 and SEO-06
carry their own verdicts; SEO-17 and LOC-03 got their crawl-state line.

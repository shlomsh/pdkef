# Search acquisition: findings, standings, and the running plan

**Owner:** the `search-acquisition` epic in [backlog/tasks/](../backlog/tasks/) (`SEO-*`).
**Status of this file:** living. It is the persistent memory for the epic - the competitor research,
the measured standings, and the week-by-week order of work. An agent picking up an `SEO-*` ticket
should read this first, and update the standings table (SEO-02) rather than re-deriving it.

Two things this file is deliberately not. It is not a task tracker: task state lives in the ticket
files. And it is not a place to record intentions - every row below is either a measurement with its
date and source, or a decision with its reasoning.

---

## 1. Where the traffic actually is (Google Search Console, last 3 months to 2026-09-07)

### Refresh procedure (SEO-02)

Follow this literally; it's what produced every number below and in section 4's standings table.

1. **Export.** In Search Console: **Performance -> Search results**, set Search type = **Web**, Date =
   **Last 3 months**, then **Export -> CSV**. Unzip it - you get `Queries.csv`, `Pages.csv`,
   `Countries.csv`, `Devices.csv`, `Chart.csv`, `Filters.csv`, `Search appearance.csv`. For the indexing
   side (SEO-01, refreshed on the same cadence): **Indexing -> Pages**, Export the top-level Coverage
   report, and separately drill into any "not indexed" category with 5+ pages to export that category's
   URL list. Same for `Coverage` and `Coverage Drilldown` folders.
2. **Run the script.** `node scripts/seo-refresh.mjs <path to the unzipped Performance export folder>`.
   It prints Markdown tables for "By page" (exact, from `Pages.csv`), "By intent cluster" (best-effort,
   see below), "By country" and "By device" (both exact). Paste the output over the matching tables
   below - **replace, don't append**; this file is a snapshot of the current state, and the git history
   is what carries the timeline.
3. **What the script cannot do**, and stays manual: the "Who is above us" / competitor columns in
   section 4, and everything in section 3, since Google blocks scripted SERP fetches (hit during SEO-04/
   SEO-05 - see those tickets) and there's no API access to a rank-tracking or backlink tool in this
   environment. Sample competitor snippets by hand (Bing/DuckDuckGo results for the same query are a
   usable proxy for *who else is playing this SERP*, not for *our* Google ranking - that only ever comes
   from the GSC export itself) and record the sampling date next to whatever you write down, since
   competitor data is the softest number in this file and the one most likely to be silently stale.
4. **Update the two date lines**: this section's "Exported" line and section 4's "Last refreshed" line,
   both to the export date. Do not overwrite a term's row if this refresh no longer has data for it
   (e.g. a query cluster that stopped ranking) - leave the row with its last-known numbers and its old
   date rather than deleting it; a term that went to zero is exactly the one worth keeping visible.

**One documented gap in the cluster table**, found running this end to end on 2026-09-10: Search
Console's `Queries.csv` omits some individual queries to protect searcher privacy (a standard, permanent
GSC behaviour), and it hits small clusters hardest - summing all matched queries for **unlock** landed
5 impressions, 3 short of the previous refresh's 8, because a few omitted low-volume queries are a bigger
share of a small total (not a real ranking drop - see that row below). The **By page** numbers don't have this problem (they come from `Pages.csv`, which is a
complete per-page aggregate, not a per-query breakdown) and are the authoritative site-wide total. Read
the cluster table as a lower bound, not an exact count - this is inherent to what Search Console exposes,
not a bug in the script to fix.

**Cadence:** monthly, plus immediately after any ticket in this epic claims a ranking or CTR change (its
own before/after numbers land in its ticket file, per that ticket's acceptance criteria - this table only
needs the reproducible baseline, not every ticket's before/after). **Next scheduled refresh: 2026-10-08**,
already set as the SEO-01/04/05 re-measurement date so one pull covers all four.

Exported 2026-09-10. Web search only. 71 clicks, ~2,318 impressions site-wide.

**The trajectory is the headline.** Impressions ran 3-15/day through July, 50-110/day in late August,
and 100-196/day in the first week of September, with average position improving from the 30s to ~10.5.
The domain is not stalled; it is early and accelerating. That is the context for every sequencing call
below: the constraint is crawl trust and click-through, not a shortage of page ideas.

### By intent cluster

Impressions are the documented lower bound above, not an exact count - see the refresh procedure.

| Cluster | Clicks | Impressions | Weighted position | Measured | Read |
| --- | ---: | ---: | ---: | --- | --- |
| blur / redact | 22 | 717 | 13.5 | 2026-09-10 | The franchise. Already page one on the specific terms. |
| compress to a size | 7 | 194 | 9.8 | 2026-09-10 | Page one, converting poorly. |
| sign | 0 | 154 | 51.7 | 2026-09-10 | 58 distinct queries, no clicks, page five. |
| split / extract | 0 | 88 | 84.9 | 2026-09-10 | We rank for the wrong vocabulary. |
| unlock | 0 | 5 | 66.0 | 2026-09-10 | Barely present - and this cluster is small enough that the privacy-filtering gap above is a big share of it; treat 5 as a floor, not the true count. |
| merge | 0 | 6 | 90.0 | 2026-09-10 | Barely present. |

### By page

| Page | Clicks | Impressions | CTR | Position |
| --- | ---: | ---: | ---: | ---: |
| `/redact/` | 45 | 1,284 | 3.50% | 13.62 |
| `/compress/` | 12 | 326 | 3.68% | 10.39 |
| `/` | 11 | 100 | 11.00% | 22.30 |
| `/how-to-sign-a-pdf-on-android/` | 1 | 130 | 0.77% | 44.18 |
| `/unlock/` | 1 | 81 | 1.23% | 34.58 |
| `/sign/` | 1 | 42 | 2.38% | 11.64 |
| `/split/` | 0 | 203 | 0% | 65.54 |
| `/merge/` | 0 | 47 | 0% | 36.13 |
| `/how-to-sign-a-pdf-on-windows/` | 0 | 46 | 0% | 48.57 |
| `/how-to-sign-a-pdf-on-iphone/` | 0 | 39 | 0% | 46.82 |
| `/licenses` (no trailing slash) | 0 | 16 | 0% | 12.88 |
| `/how-to-sign-a-pdf-on-mac/` | 0 | 4 | 0% | 9.00 |

Absent from the report entirely, therefore earning nothing: `/edit-pdf/`, `/image-to-pdf/`,
`/pdf-to-image/`, and every landing page except the four OS guides.

### By country and device

India 36 clicks / 813 impressions at position 12.66 is the audience, by a distance. Israel is second by
clicks (8) on only 20 impressions - a 40% CTR at position 6.65, which is a small but genuine signal.
Then the United States (4 / 360 at 31.97), Malaysia, Indonesia, the Philippines, Pakistan.

Desktop 52 clicks / 1,764 impressions at position 25.21; mobile 18 / 430 at 14.70. Mobile ranks
markedly better than desktop and is under-served by impressions - worth remembering for a product that
describes itself as mobile-first.

### Indexing state (SEO-01, 2026-09-10)

Full detail and reasoning in [SEO-01](../backlog/tasks/SEO-01.md). Summary: 27 pages tracked, 11
indexed, 16 not - split as 9 "Discovered - currently not indexed" (the nine URLs below, submitted for
indexing via URL Inspection on 2026-09-10, none yet crawled), 4 "Page with redirect", 2 "Excluded by
noindex tag" and 1 "Crawled - currently not indexed" (the last three not yet identified by exact URL).
The nine:

`/blur-vs-blackout-vs-delete-pdf/`, `/edit-pdf/`, `/image-to-pdf/`, `/install-pdf-app/`,
`/offline-pdf-form-filler/`, `/open-source-pdf-editor/`, `/pdf-to-image/`,
`/permanently-delete-text-from-pdf/`, `/sign-pdf-no-signup/`.

This cohort was 4 pages from mid-July to 2026-08-28, then jumped to 9 on 2026-08-29 when several newer
pages (Unlock, Image to PDF, Edit Pages, two content pages) entered the sitemap - none of the 11 indexed
pages has grown since 2026-08-18 while the not-indexed count climbed from 8 to 16 over the same window.
Read as: the newer pages simply haven't been promoted yet, on a domain that's ~3 months old, not a
content-quality signal. Re-measure alongside the rest of this section: **2026-10-08**.

*(All performance numbers above - by page, by query, by country/device - were pulled fresh from a
2026-09-10 Search Console export and matched what's already recorded here exactly. No drift since this
section was first written, same day.)*

---

## 2. The three findings that reorder the plan

**2.1 We are on page one for blur and not being clicked.** Thirteen blur and blackout queries sit at
positions 5.8 to 11.4, carry 160 impressions between them, and returned **zero clicks**:

| Query | Impressions | Position |
| --- | ---: | ---: |
| blur text in pdf | 32 | 11.44 |
| blur text in pdf online free | 23 | 6.65 |
| pdf blur tool | 17 | 8.47 |
| blur pdf online free | 16 | 7.38 |
| blur in pdf | 16 | 8.12 |
| blackout text in pdf free | 13 | 9.77 |
| blur out pdf | 10 | 9.30 |
| pdf blur text | 8 | 9.88 |
| pdf text blur online | 7 | 7.14 |
| blur text pdf | 7 | 7.57 |
| blur the pdf | 7 | 7.86 |
| online pdf blur tool | 6 | 5.83 |
| black and blur pdf | 5 | 9.00 |

A page-one position with no clicks is a snippet problem, not a ranking problem. This is the cheapest
available win on the site and no keyword-volume research can see it. SEO-04.

**2.2 People are asking us to compress things that are not PDFs.** 128 impressions and 6 clicks came
from queries with no "pdf" in them at all - "file compressor to 100kb" (81 impressions, position 9.6),
"reduce file size to 100kb" (26), "image size reduce to 100kb", "100 kb document size". They land on
`/compress/`, which only accepts PDFs. That is measured demand for a target-size *image* compressor,
which is a small, wholly client-side canvas tool. SEO-19.

**2.3 The sign cluster is our worst-performing and our strongest product.** 58 distinct sign queries,
154 impressions, weighted position 51.7, zero clicks. `/sign/` itself drew 42 impressions in three
months. Meanwhile the tool supports Hebrew, Arabic, Pashto, Bengali, Devanagari, Tamil, Telugu,
Gurmukhi, Thai, Cyrillic and Greek with real font embedding, native RTL, and comb-field detection -
support no free browser-side signer we know of matches, aimed squarely at the country already sending
us the most traffic. The page says almost none of this. SEO-07, SEO-12, SEO-18.

*Progress note, 2026-09-11 (SEO-07):* the page now says it - the language card leads with the claim
(right-to-left native, 20 languages, world-class font support for free), the subhead carries the
language count and the printed-box behaviour above the fold, comb fields are described in a step and
an FAQ entry (the feature had no user-facing mention anywhere on the site before this), and the
refuse-while-typing guarantee is an FAQ entry framed as a promise kept. A list of the scripts with no
bundled font was built and then removed on Shlomi's call: the section is marketing, and gaps go
through the request path, not a list. **One finding from that ticket changes how the rest of this cluster should be
read, and it is not what the section above assumed:** there is not a single language-intent sign query
in the export. All 58 are device intent (iphone, android, computer, windows, whatsapp), and all sit at
positions 43-66, which is the four OS guides, not `/sign/`. `/sign/` itself ranks at 11.64 on queries
Search Console withholds under its privacy filter, so **we do not know what it ranks for**. The
language advantage is real and is now stated, but its search demand is unmeasured here - SEO-18 should
open with that question rather than treat it as settled.

Worth noting inside that cluster: "how to sign on pdf file sent through whatsapp" appears five times
(19 impressions, positions 48-50). PDkef's own copy already names the WhatsApp attachment case. We are
being shown for our own story and losing it on authority.

*Progress note, 2026-09-11 (SEO-12):* the full review ran against this cluster, end to end. Real Google
and Bing SERPs (screenshots) plus WebSearch for the three highest-impression queries confirm the shape
above with primary data: page one is Apple/Microsoft first-party docs, Adobe, Dropbox, Smallpdf, video
results, and - on Bing - four sponsored slots making exactly SEO-11's four claims ("Free", "Works on
Any Device", "Secure") with no evidence, from upload-based tools. No result in ten across three queries
and two engines mentions language/script support; this is a device-workflow query, not a language one.
Zero language-name or comb-field-vocabulary queries exist anywhere in the full 207-row export, not just
this cluster - there is no query-derived wording to add for either. Conclusion: SEO-07 already shipped
everything this review would have proposed (the language card, the native-script FAQ questions, the
WhatsApp section, the plain-language comb-field description); no further copy change is warranted. Full
method and reasoning in [SEO-12](../backlog/tasks/SEO-12.md#progress-2026-09-11).

---

## 3. The competitive landscape (deep research, 2026-09)

Incumbents, for scale. Nothing here is winnable head-on and nothing here should be treated as a target.

| Platform | Monthly organic visits | Authority | Main audience | Top organic drivers |
| --- | --- | --- | --- | --- |
| ilovepdf.com | 163.7M | DR 83 | India 29.3%, Indonesia 12.8%, Brazil 6.8% | "i love pdf" 5.9M, "jpg to pdf" 4.8M, "pdf to word" 4.0M |
| smallpdf.com | 38.5-55.0M | AS 83 | India 17.8%, US 10.6%, Bangladesh 9.0% | "jpg to pdf" 6.12M, "pdf to word" 5.0M, "pdf compressor" 1.83M |
| pdf24.org | 12.3M | DA 59 | Germany, US, global | brand, "merge pdf", "compress pdf" |
| sejda.com | 10.3M | DR 81 | US, Western Europe | "edit pdf online", "pdf editor", "compress pdf" |
| pdfgear.com | 2.9M | DR 65 | US, East Asia | brand, "free pdf editor", "convert pdf" |

They rank on brand demand, task completion and age, not on page copy. Their structural weaknesses are
the same four in every case: files are uploaded to a server, "free" is usually freemium with a daily
cap or a watermark, privacy is asserted rather than demonstrable, and the long tail of
execution-specific queries is unserved. Those four are the whole basis of our positioning, and SEO-11
turns them into claims we can actually evidence.

### Winning queries the research identified, and what we decided

| Query | Est. volume | Who wins it now | Our decision | Ticket |
| --- | --- | --- | --- | --- |
| compress pdf to 100kb / 200kb / 500kb | 280k-600k combined | smallseotools, PDNob, DocHub | `/compress/` already carries this h1 and the feature. Reject the three doorway variants; fix CTR and write one honest guide. | SEO-05, SEO-17 |
| make pdf look scanned | 40k-90k | supertool, scanyourpdf, LookScanned | Build. Fragmented SERP, wholly client-side, and it belongs in a one-stop suite. | SEO-24 |
| grayscale pdf / pdf to black and white | 30k-80k | supertool, Cloudinary | Build, late. Must disclose that our path rasterizes. | SEO-23 |
| flatten pdf online | 20k-50k | mytulify, toolspivot | Build. Also closes MOBI-02, where filled forms export with live empty widgets. | SEO-21 |
| extract images from pdf | 40k-100k | digitalheroesco, toolscopilot | Build, late. Zip-free per the PdfToImage precedent. | SEO-22 |
| crop pdf online | 30k-70k | launchvibe, toolslabpro, Sejda | Build. Lossless CropBox edit, reuses the editor's box gesture, no trade-off to disclose. | SEO-20 |
| merge pdf online free no limit | 60k-140k | iLovePDF, supertool | Expand `/merge/`. The fact is already in the FAQ; move it where it is read. | SEO-10 |
| permanently redact pdf | 15k-35k | Adobe, Sejda | Expand `/redact/`. Add the searched word and a test the reader can run. | SEO-04 |
| sign pdf online without account | 25k-60k | DocHub, Smallpdf | Expand both pages. Reject merging `/sign-pdf-no-signup/` into `/sign/`. | SEO-07 |
| compress pdf without losing quality | 45k-110k | supertool, DocHub | Expand honestly: we rasterize, so we cannot claim lossless. | SEO-05, SEO-25 |

### Rejected as architecturally impossible

Recorded so they are not re-proposed. Each conflicts with no backend, no upload, no accounts.

| Query | Volume | Why not |
| --- | --- | --- |
| pdf to word / pdf to docx | 5M+ | Layout reconstruction into OpenXML needs a server-side engine; a client-side approximation returns broken tables and a bounce. |
| pdf ocr / extract text from scanned pdf | 300k+ | 20MB+ of language data per language and a locked UI thread on mobile. |
| e-sign with audit trail | 100k+ | eIDAS/ESIGN needs server PKI, a timestamping authority and tamper-evident logs. |
| ai chat with pdf / summarize pdf | 500k+ | External LLM endpoints; sends document content off-device. |
| cloud batch compress 500mb | 50k+ | Exceeds per-tab heap. |

SEO-26 covers saying so on the site, in a section rather than a page.

---

## 4. Standings against the competition (SEO-02 keeps this current)

Refresh monthly, or after any ticket that claims a ranking change, following section 1's refresh
procedure. "Our position/impressions" come straight from the same GSC export as section 1 (exact for a
single query, lower-bound for a cluster - see that section's note). "Who is above us" is manual SERP
sampling, the softest data in this file: it comes from the section 3 deep research (dated **2026-09**,
no finer granularity than the month) unless a row says otherwise. The two rows SEO-04 and SEO-05 touched
also carry a **2026-09-10** cross-check against Bing/DuckDuckGo results for the same queries (not
Google - direct Google SERP capture is blocked for scripted fetches, see those tickets), used only to
see who else competes on that SERP, not to read our own Google position.

**Last refreshed: 2026-09-10.**

| Winning term | Our position | Our impressions | Measured | Who is above us | Gap to close | Ticket |
| --- | ---: | ---: | --- | --- | --- | --- |
| blur pdf online | 8.78 | 160 | 2026-09-10 | supertool, small utility sites (2026-09; cross-checked 2026-09-10) | Snippet CTR, not rank | SEO-04 |
| blur text in pdf | 11.44 | 32 | 2026-09-10 | mixed utilities (2026-09; cross-checked 2026-09-10) | Rank + snippet | SEO-04 |
| compress pdf to 100kb (cluster) | 9.8 | 194 | 2026-09-10 | smallseotools, PDNob, DocHub (2026-09; cross-checked 2026-09-10) | Snippet CTR, honest size guidance | SEO-05, SEO-17 |
| file compressor to 100kb | 9.60 | 81 | 2026-09-10 | generic file compressors (2026-09) | We do not have the tool yet | SEO-19 |
| sign pdf on android / iphone (cluster) | 51.7 | 154 | 2026-09-10 | DocHub, Smallpdf, OS vendor docs (2026-09) | Rank, from near zero. Note this cluster is the OS guides', not `/sign/`'s - see 2.3's progress note | SEO-08, SEO-12 |
| `/sign/` itself (queries withheld by GSC) | 11.64 | 42 | 2026-09-10 | unknown - no query in the export matches this position | Title changed 2026-09-11 (SEO-07); re-measure CTR against 2.38% | SEO-07 |
| extract pdf / pdf extractor | 84.9 | 88 | 2026-09-10 | iLovePDF, Sejda (2026-09) | Vocabulary: we say "split" | SEO-09 |
| merge pdf | 90.0 | 6 | 2026-09-10 | iLovePDF, Smallpdf (2026-09) | Authority | SEO-10, SEO-03 |
| unlock / protect pdf | 66.0 | 5 | 2026-09-10 | Smallpdf, iLovePDF (2026-09) | Authority - and this cluster's impressions are a documented lower bound, see section 1 | SEO-16 |
| jpg to pdf | not present | 0 | 2026-09-10 | iLovePDF, Smallpdf (2026-09) | `/image-to-pdf/` is not indexed | SEO-06, SEO-15 |

### Non-ranking dimensions

| Dimension | Us | Incumbents | Honest read |
| --- | --- | --- | --- |
| Domain authority | new (launched ~2026-06) | DR 59-83 | The binding constraint. Only SEO-03 moves it. |
| Free | free, no cap, no watermark, no account | freemium with daily caps and paid tiers | A real, checkable difference. Say it plainly, never as a competitor attack. |
| Privacy | on-device, demonstrable with devtools offline | asserted, files uploaded | Our only claim a competitor structurally cannot copy. |
| Open source | MIT, auditable | closed | Underused. |
| Language support (Sign) | 11+ scripts, native RTL, comb fields | Latin-centric | Largest unmatched product advantage, aimed at our largest audience. |
| Offline / installable | full PWA, works with no connection | none | Underused. |
| Indexed page count | 12 of 22 URLs earning impressions (2026-09-10, exact - see By page) | thousands | SEO-06. |

---

## 5. The running plan (weeks from 2026-09-10)

Gates matter more than dates. A phase that starts before its gate is met spends crawl budget the
domain does not have.

**Week 1 (Sep 10-16) - measure, then take the free clicks.**
SEO-01 (indexing baseline, sitemap `lastmod`, GSC indexing requests), SEO-02 (standings table above
becomes a maintained artefact), SEO-04 (blur snippets), SEO-05 (compress snippets and honest quality
copy). No new URLs this week.

*Progress note, 2026-09-10:* All four Week 1 tickets done. SEO-01: sitemap `lastmod` and the non-slash-
link check shipped and verified against a real build; the indexing baseline (27 pages tracked, 11
indexed, the nine never-indexed URLs confirmed submitted via URL Inspection, none crawled yet) came from
Shlomi's own Search Console exports and is recorded in section 1 and SEO-01's ticket. SEO-02: the refresh
procedure is written (top of section 1) and backed by `scripts/seo-refresh.mjs`, run end to end against
that same export - section 1 and section 4's tables above are its output. SEO-04 and SEO-05 shipped a
diagnosed snippet change plus (for SEO-05) the above-the-FAQ rasterization/passthrough disclosure - see
each ticket for the diagnosis, since direct Google SERP capture was blocked by bot-detection this session
and the hypotheses are built from our own served meta plus the real competitive field on other engines
instead. **Re-measurement date for all four: 2026-10-08**, which doubles as SEO-02's next scheduled
refresh.

**Week 2 (Sep 17-23) - the two structural problems.**
SEO-06 (make the nine never-indexed URLs worth crawling), SEO-07 (`/sign/` states the language
advantage), SEO-11 (the positioning-review protocol), SEO-12 (the Sign review, first agent-run one).

*Progress note, 2026-09-11:* SEO-07 done, ahead of its week. Its `/sign/` title change and its finding
about withheld queries both re-measure on **2026-10-08** with the rest.

**Week 3 (Sep 24-30) - the losing clusters.**
SEO-08 (OS guides at position 44-58), SEO-09 (`/split/` and the "extract" vocabulary), SEO-10
(`/merge/`), SEO-13 (Compress review), SEO-17 (the portal-size-limit guide - first new URL of the epic).

**Week 4 (Oct 1-7) - re-measure and decide.**
SEO-14, SEO-15 (remaining reviews), SEO-18 (the language page). Pull a fresh GSC export and update
section 1 and section 4. **Gate:** if none of the nine never-indexed URLs has been crawled by now,
stop adding URLs and put the effort into SEO-03 instead.

**Weeks 5-6 (Oct 8-21) - first new tools, one at a time.**
SEO-19 (image compressor to a target size - the only one with measured demand behind it), then SEO-20
(crop). Each ships alone, with a week between launches, so its indexing can be attributed.

**Weeks 7-8 (Oct 22 - Nov 4).** SEO-21 (flatten, with MOBI-02), SEO-22 (extract images).

**Week 9 onwards.** SEO-23 (grayscale), SEO-24 (scanned look), SEO-16 (remaining reviews), then the
deferred SEO-25, SEO-26, SEO-27. Re-measure and re-order at every phase boundary; this list is the
current best order, not a commitment to it.

**Running throughout:** SEO-03 (external signals). It is the only work that moves the constraint, it
does not live in this repo, and it will not happen unless it stays on the board.

---

## 6. The positioning review protocol (SEO-11)

SEO-12 through SEO-16 are per-tool deep reviews, each intended to be run by its own agent with a real
token budget. Five agents reviewing five tools against five private notions of what PDkef stands for
would produce five incompatible voices. This section is the shared brief they all start from - written
once, here, and every review ticket references it rather than restating it.

### The four claims, and the evidence each needs

Every competitor in this market says it is free, private, fast and easy. Three of those four are, for
them, marketing. For us they are consequences of an architecture, which means we can evidence them and
they cannot. **A review may lean on a claim only with its evidence attached.**

| Claim | What is actually true | What proves it | What we must never say |
| --- | --- | --- | --- |
| Free | No account, no cap, no watermark, no paid tier, and none planned. It is free because it costs almost nothing to run. | The product itself, and the absence of any upgrade path anywhere in it. | "Free tier". "Free forever" as a promise. Anything implying a paid version is coming. |
| Private | Nothing is uploaded. There is no PDF backend to upload to. | A visitor can open devtools, go offline, and watch the tool work. `/open-source-pdf-editor/` already documents that test. | "Military-grade", "100% secure", "breach-proof". Security theatre in place of the demonstration. |
| Open source | MIT, auditable, the repository is public. | The repository and `/licenses/`. | Implying an audit has been performed that has not. |
| Works on any device | Mobile-first, installable, works offline once provisioned. | Mobile ranks better than desktop in our own Search Console data (section 1, By country and device). | "Works everywhere" without naming the browser constraints that exist. |

*Re-checked as still true, 2026-09-11: no `src/data/tools.js`, `.astro` page, or `content-pages` entry
uses any phrase in the "must never say" column against our own product; `/open-source-pdf-editor/`
still carries the devtools-offline test; `/licenses/` still exists and is the license source of truth.*

### The rule that keeps this honest, and it is the one that will be tempting to break

Competitors being freemium in disguise, or being unable to prove their privacy claims, is *true* and is
*not ours to say*. CLAUDE.md's first voice principle is explicit: explain, do not compete; no "unlike
[Competitor]" framing; the tools registry had competitor references removed deliberately and they are
not going back (see "Product, voice & copy" in CLAUDE.md).

The correct move is to state our own fact so plainly that the comparison happens in the reader's head.
"Your file does not leave your device" does that work. "Unlike other tools, we don't upload your file"
does it worse and makes us sound like everyone else.

### The per-tool method

Every review ticket (SEO-12 through SEO-16) follows this:

1. Pull the tool's queries out of the latest Search Console export (section 1). Rank them by
   impressions. These are the words real people use, and they outrank any keyword-volume estimate in
   section 3's research. **Check first that the cluster's queries actually land on the tool's own
   page** - cross-reference against the "By page" table. SEO-12 found that Sign's entire 58-query
   cluster ranks on the four OS guides, not on `/sign/` itself, which ranks on queries GSC withholds
   under its privacy filter. Running the top-ten analysis without this check means analysing the wrong
   page's SERP.
2. Read the top ten results for the three highest-impression queries. Record what each page leads with,
   what it claims, what it hides, and what its actual limits are behind the signup wall.
3. Compare against our page's current copy, word by word, including `seoTitle`, `seoDescription`, `h1`,
   `subhead`, `gridDescription`, the step copy and every FAQ answer in `src/data/tools.js`.
4. Name the differentiator this specific tool has that the competition structurally cannot match. Some
   have a strong one (Sign's language support; Redact's flattening being verifiable). Some have only the
   four general claims above, and a review that invents a fifth is doing harm.
5. Propose concrete copy, with the diff, and the evidence for each claim it makes.

### The worked example

SEO-12 (the Sign review) is the model for the other four: it names the specific advantage precisely
(real font embedding across eleven scripts, UAX#9 bidi, per-glyph shaped positioning, RTL boxes that
grow from a fixed right edge, comb-field detection), states the acceptance criteria in SEO-11's terms
(query list, top-ten analysis, word-by-word comparison, named differentiator, evidenced claims, no
competitor references), and is explicit about where the review should be sceptical of its own
enthusiasm ("supports 11 scripts" is a marketing sentence; "the letters come out in the right order in
the file you download" is the thing a person needed). Read it before starting SEO-13 through SEO-16.

**SEO-12 is also the model for a review that correctly concludes "no change."** It ran the method end
to end - real SERP samples for the three highest-impression queries, a full re-derivation of the query
list from the raw export rather than the cluster summary, a word-by-word comparison against the pages
that actually rank - and found that a prior ticket (SEO-07) had already shipped everything this one
would have proposed. It said so, with the evidence for each "already correct" verdict, rather than
inventing a copy change to have something to ship. The next four reviews should read this as permission
to reach the same conclusion where it is true.

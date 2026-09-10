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

Exported 2026-09-10. Web search only. 70 clicks, ~2,200 impressions site-wide.

**The trajectory is the headline.** Impressions ran 3-15/day through July, 50-110/day in late August,
and 100-196/day in the first week of September, with average position improving from the 30s to ~10.5.
The domain is not stalled; it is early and accelerating. That is the context for every sequencing call
below: the constraint is crawl trust and click-through, not a shortage of page ideas.

### By intent cluster

| Cluster | Clicks | Impressions | Weighted position | Read |
| --- | ---: | ---: | ---: | --- |
| blur / redact | 22 | 718 | 13.6 | The franchise. Already page one on the specific terms. |
| compress to a size | 7 | 195 | 9.7 | Page one, converting poorly. |
| sign | 0 | 154 | 51.7 | 58 distinct queries, no clicks, page five. |
| split / extract | 0 | 92 | 85.0 | We rank for the wrong vocabulary. |
| unlock | 0 | 8 | 78.9 | Barely present. |
| merge | 0 | 6 | 90.0 | Barely present. |

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

Worth noting inside that cluster: "how to sign on pdf file sent through whatsapp" appears five times
(19 impressions, positions 48-50). PDkef's own copy already names the WhatsApp attachment case. We are
being shown for our own story and losing it on authority.

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

Refresh monthly, or after any ticket that claims a ranking change. Positions come from the GSC export
for us; competitor positions come from the SERP sampling in the research above.

**Last refreshed: 2026-09-10 (baseline).**

| Winning term | Our position | Our impressions | Who is above us | Gap to close | Ticket |
| --- | ---: | ---: | --- | --- | --- |
| blur pdf online | 8.78 | 160 | supertool, small utility sites | Snippet CTR, not rank | SEO-04 |
| blur text in pdf | 11.44 | 32 | mixed utilities | Rank + snippet | SEO-04 |
| compress pdf to 100kb (cluster) | 9.7 | 195 | smallseotools, PDNob, DocHub | Snippet CTR, honest size guidance | SEO-05, SEO-17 |
| file compressor to 100kb | 9.60 | 81 | generic file compressors | We do not have the tool yet | SEO-19 |
| sign pdf on android / iphone (cluster) | 51.7 | 154 | DocHub, Smallpdf, OS vendor docs | Rank, from near zero | SEO-07, SEO-08, SEO-12 |
| extract pdf / pdf extractor | 85.0 | 92 | iLovePDF, Sejda | Vocabulary: we say "split" | SEO-09 |
| merge pdf | 90.0 | 6 | iLovePDF, Smallpdf | Authority | SEO-10, SEO-03 |
| unlock / protect pdf | 78.9 | 8 | Smallpdf, iLovePDF | Authority | SEO-16 |
| jpg to pdf | not present | 0 | iLovePDF, Smallpdf | `/image-to-pdf/` is not indexed | SEO-06, SEO-15 |

### Non-ranking dimensions

| Dimension | Us | Incumbents | Honest read |
| --- | --- | --- | --- |
| Domain authority | new (launched ~2026-06) | DR 59-83 | The binding constraint. Only SEO-03 moves it. |
| Free | free, no cap, no watermark, no account | freemium with daily caps and paid tiers | A real, checkable difference. Say it plainly, never as a competitor attack. |
| Privacy | on-device, demonstrable with devtools offline | asserted, files uploaded | Our only claim a competitor structurally cannot copy. |
| Open source | MIT, auditable | closed | Underused. |
| Language support (Sign) | 11+ scripts, native RTL, comb fields | Latin-centric | Largest unmatched product advantage, aimed at our largest audience. |
| Offline / installable | full PWA, works with no connection | none | Underused. |
| Indexed page count | 13 of 22 URLs earning impressions | thousands | SEO-06. |

---

## 5. The running plan (weeks from 2026-09-10)

Gates matter more than dates. A phase that starts before its gate is met spends crawl budget the
domain does not have.

**Week 1 (Sep 10-16) - measure, then take the free clicks.**
SEO-01 (indexing baseline, sitemap `lastmod`, GSC indexing requests), SEO-02 (standings table above
becomes a maintained artefact), SEO-04 (blur snippets), SEO-05 (compress snippets and honest quality
copy). No new URLs this week.

*Progress note, 2026-09-10:* SEO-01's sitemap `lastmod` and the non-slash-link check are done and
verified against a real build; SEO-04 and SEO-05 shipped a diagnosed snippet change plus (for SEO-05)
the above-the-FAQ rasterization/passthrough disclosure - see each ticket for the diagnosis, since direct
Google SERP capture was blocked by bot-detection this session and the hypotheses are built from our own
served meta plus the real competitive field on other engines instead. **Re-measurement date for all
three: 2026-10-08.** SEO-01's GSC indexing baseline and the nine URL Inspection submissions are blocked
on Search Console access this session doesn't have - see SEO-01's Progress section.

**Week 2 (Sep 17-23) - the two structural problems.**
SEO-06 (make the nine never-indexed URLs worth crawling), SEO-07 (`/sign/` states the language
advantage), SEO-11 (the positioning-review protocol), SEO-12 (the Sign review, first agent-run one).

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

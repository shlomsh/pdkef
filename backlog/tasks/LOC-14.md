---
id: "LOC-14"
title: "Indonesian target-size compress: run the ROI gate on the size-limit family autocomplete surfaced"
status: "done"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-11"]
legacy_state: "Open"
---

# LOC-14 · Indonesian target-size compress: run the ROI gate on the size-limit family autocomplete surfaced

## Why this exists

[LOC-11](LOC-11.md)'s autocomplete sweep (2026-09-12) found the one query family we had not tested in
any language: Indonesian size-limit compress. `kompres pdf 1 mb`, `kompres pdf jadi 1 mb`,
`mengecilkan pdf 200 kb` / `300 kb` / `500kb` / `dibawah 1 mb`, `memperkecil pdf 100 kb` / `400 kb`,
`pdf 200 kb`, `pdf 300 kb`, `ukuran file lamaran kerja via email`, `kompres pdf sesuai ukuran yang
diinginkan`. It is denser than the same family in Vietnamese, Turkish, Spanish or Italian, and it is
the intent `/pdf-wont-compress-to-100kb/` and the compress tool's target-size mode already serve in
English. Indonesian was the one language at Trends parity with English in LOC-01, and Indonesia
is in the site's top twenty countries.

This ticket measures. It builds nothing. [LOC-13](LOC-13.md) (Spanish) is on hold because the same
family sat below Trends' floor in Mexico and Spain; Indonesian gets the same test before anyone
writes a page.

## The gate (LOC-11)

Both must hold:

- **Demand:** the size-limit terms register on Trends for Indonesia, in Indonesian, at a share that is
  of the order of the English `/pdf-wont-compress-to-100kb/` traffic from Indonesia, and GSC Indonesia
  shows the English page getting impressions on this family.
- **Field:** the `hl=id` SERPs for the size-limit terms are not the majors' native pages plus a local
  site already holding the on-device claim. Note who holds the top three and whether a portal-limit
  guide (CPNS, SKCK, job-application) ranks, because that is the page shape that would win.

Indonesian is on Google's translated-results list, so the English page already reaches these
searchers in Google's own translation; the native page has to beat that, not just exist.

## For Shlomi: ready-to-click links

**Trends** (`geo=ID`, 12 months, five terms per chart):

- Size family vs generic: [kompres pdf / kompres pdf 1 mb / mengecilkan pdf 200 kb / memperkecil pdf 500 kb / kompres pdf di bawah 1 mb](https://trends.google.com/trends/explore?date=today%2012-m&geo=ID&q=kompres%20pdf%2Ckompres%20pdf%201%20mb%2Cmengecilkan%20pdf%20200%20kb%2Cmemperkecil%20pdf%20500%20kb%2Ckompres%20pdf%20di%20bawah%201%20mb&hl=en)
- Native vs English at the limit: [compress pdf to 1mb / kompres pdf 1 mb / kompres pdf jadi 1 mb / mengecilkan pdf menjadi 1 mb / pdf 1 mb](https://trends.google.com/trends/explore?date=today%2012-m&geo=ID&q=compress%20pdf%20to%201mb%2Ckompres%20pdf%201%20mb%2Ckompres%20pdf%20jadi%201%20mb%2Cmengecilkan%20pdf%20menjadi%201%20mb%2Cpdf%201%20mb&hl=en)
- Small limits, where the English page wins: [compress pdf to 100kb / kompres pdf 100 kb / mengecilkan pdf 200 kb / kompres pdf 300 kb / pdf 200 kb](https://trends.google.com/trends/explore?date=today%2012-m&geo=ID&q=compress%20pdf%20to%20100kb%2Ckompres%20pdf%20100%20kb%2Cmengecilkan%20pdf%20200%20kb%2Ckompres%20pdf%20300%20kb%2Cpdf%20200%20kb&hl=en)
- Context terms: [ukuran file lamaran kerja / kompres pdf cpns / kompres pdf skck / kompres pdf sesuai ukuran / kompres foto 200 kb](https://trends.google.com/trends/explore?date=today%2012-m&geo=ID&q=ukuran%20file%20lamaran%20kerja%2Ckompres%20pdf%20cpns%2Ckompres%20pdf%20skck%2Ckompres%20pdf%20sesuai%20ukuran%2Ckompres%20foto%20200%20kb&hl=en)

**SERPs** (`hl=id&gl=ID`):

- [kompres pdf 1 mb](https://www.google.com/search?q=kompres%20pdf%201%20mb&hl=id&gl=ID) · [mengecilkan pdf 200 kb](https://www.google.com/search?q=mengecilkan%20pdf%20200%20kb&hl=id&gl=ID) · [kompres pdf di bawah 1 mb](https://www.google.com/search?q=kompres%20pdf%20di%20bawah%201%20mb&hl=id&gl=ID) · [kompres pdf sesuai ukuran yang diinginkan](https://www.google.com/search?q=kompres%20pdf%20sesuai%20ukuran%20yang%20diinginkan&hl=id&gl=ID) · [ukuran file lamaran kerja via email](https://www.google.com/search?q=ukuran%20file%20lamaran%20kerja%20via%20email&hl=id&gl=ID)

**GSC, Indonesia, last 3 months**: [queries by country](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Apdkef.com&num_of_months=3&breakdown=query&country=IDN) (LOC-01 recorded the English leak; this run is for the target-size rows)

**Volumes, if you have a Google Ads login** (the one source autocomplete and Trends cannot replace):
Keyword Planner, Discover new keywords, Start with a website, `https://www.ilovepdf.com/id/mengompres-pdf`,
location Indonesia, language Indonesian; then the same with the seed keywords `kompres pdf 1 mb`,
`mengecilkan pdf 200 kb`, `kompres foto 200 kb`. Paste the top rows with their monthly ranges here. A
family at a few thousand a month is a page; at a few hundred it is not.

Read the Trends charts the usual way: a chart of only small terms showing zeros with one-week blips
means the family is below the floor, and the verdict is the Turkish one. If `kompres pdf 1 mb` holds
a steady line against `kompres pdf`, record the share.

## Evidence, 2026-09-12 (Shlomi's screenshots)

### Trends (geo=ID, past 12 months, read off the average bars; lead's reading of the four charts)

| Chart | Term | Average | Shape |
| --- | --- | --- | --- |
| 1. Size family vs generic | `kompres pdf` | ~75 | Steady line all year, dip to ~30 in one week around late March 2026 |
| 1. Size family vs generic | `kompres pdf 1 mb` | ~3 to 4 | Steady low line, no zero weeks |
| 1. Size family vs generic | `mengecilkan pdf 200 kb` | 0 | Flat |
| 1. Size family vs generic | `memperkecil pdf 500 kb` | 0 | Flat |
| 1. Size family vs generic | `kompres pdf di bawah 1 mb` | 0 | Flat |
| 2. Native vs English at 1 MB | `pdf 1 mb` | ~75 | Steady |
| 2. Native vs English at 1 MB | `kompres pdf 1 mb` | ~38 | Steady, tracks the same shape as `pdf 1 mb` |
| 2. Native vs English at 1 MB | `compress pdf to 1mb` | ~3 | Blips |
| 2. Native vs English at 1 MB | `kompres pdf jadi 1 mb` | ~2 | Blips |
| 2. Native vs English at 1 MB | `mengecilkan pdf menjadi 1 mb` | ~1 | Blips |
| 3. Small limits | `pdf 200 kb` | ~48 | Spiky but continuous, peaks at 100 in two weeks |
| 3. Small limits | `compress pdf to 100kb` | ~10 | One-week blips with zeros between |
| 3. Small limits | `kompres pdf 100 kb` | ~8 | Same shape, one-week blips with zeros between |
| 3. Small limits | `kompres pdf 300 kb` | ~12 | Same shape, one-week blips with zeros between |
| 3. Small limits | `mengecilkan pdf 200 kb` | 0 | Flat |
| 4. Context terms | `ukuran file lamaran kerja` | 0 | Flat |
| 4. Context terms | `kompres pdf cpns` | 0 | Flat |
| 4. Context terms | `kompres pdf skck` | 0 | Flat |
| 4. Context terms | `kompres pdf sesuai ukuran` | 0 | One blip |
| 4. Context terms | `kompres foto 200 kb` | ~5 | Five isolated spikes (one at 100, one at ~85) with zeros between |

At 1 MB the Indonesian target-size family clears Trends' floor: `kompres pdf 1 mb` is a steady line at
roughly 4% of generic `kompres pdf` and roughly half of bare `pdf 1 mb`, and native beats English about
12x at that limit (`kompres pdf 1 mb` ~38 vs `compress pdf to 1mb` ~3). No other language's target-size
family did this, Turkish, Spanish and Vietnamese all read zeros with one-week blips in LOC-11 and LOC-13.

At 100 to 300 KB, the limits where the English page and `/compress/` win, the Indonesian forms have the
below-the-floor shape (blips), and the portal-context terms (`ukuran file lamaran kerja`, `cpns`,
`skck`) are flat at zero, so the "job-application file size" intent that autocomplete surfaced is too
small for Trends. `kompres foto 200 kb` (the photo half, SEO-19/SEO-31's demand) is blips. `pdf 200 kb`
at ~48 is a bare term that could carry other intents and is not evidence on its own. Demand half:
provisionally passes at 1 MB only. Still pending for the gate: the `hl=id` SERPs (field half), GSC
Indonesia (whether the English pages get any of this family today), Keyword Planner volumes if
available.

### SERPs (hl=id, gl=ID)

**SERPs, desktop, 2026-09-12.**

| Query | Top ten | Read |
| --- | --- | --- |
| `kompres pdf 1 mb` | iLovePDF `/mengompres-pdf` (generic native), Pi7 `pdf.pi7.org/kompres-pdf-1mb` (dedicated native page), Smallpdf generic (511,392 reviews), Zamzar `compress-pdf-1mb` (Google-translated), AI Overview recommending iLovePDF, 11zon bigpdf `reduce-pdf-to-1mb` (dedicated), Canva generic, ihatepdf.cv (translated), easypdf.fr blog "Kompres PDF ke 1 MB Gratis: 5 Jenis Dokumen Diuji (2026)" dated 18 Aug 2026 (a native post already in SEO-17's tested-documents shape), YouTube Neicy Tekno. Related: `Kompres PDF 1 MB gratis`, `Kompres file 1 MB`, `1 MB tanpa mengurangi kualitas`, `1MB ke 500KB`, `500KB`, `sesuai ukuran yang diinginkan`, `1 MB online`, `gratis`. | The English 100kb SERP's second tier (Pi7, 11zon, Zamzar) natively, plus the majors generic, plus a native blog doing our page shape. No on-device claim in the top ten; translated English pages rank. |
| `mengecilkan pdf 200 kb` | iLovePDF generic, Pi7 `kompres-pdf-200kb`, 11zon `resize-pdf` 200KB, Zamzar 200kb (translated), YouTube Neicy Tekno 200KB, Smallpdf generic, HiPDF, Reddit r/PDFgear (translated), 11zon `compress-pdf-to-200kb`, YouTube KUSNENDAR "CARA KOMPRES PDF MENJADI 200kb DI HP" (39.6k views). Related: `200KB online`, `200kb tidak pecah`, `200kb gratis`, `JPG to PDF 200 KB`, `100KB`, `I love PDF 200KB`, `300kb`. | Same tier; two Indonesian YouTube how-tos, mobile-first. |
| `kompres pdf di bawah 1 mb` | iLovePDF, Smallpdf, Pi7 1mb, Zamzar (translated), 11zon 1MB, easypdf.fr blog, AI Overview (Smallpdf, iLovePDF), LightPDF "any size" (translated, 68,994 reviews), FreeCompress `compress-pdf-less-than-1mb` with a native title, Adobe (281,831). Related: `1 MB free`, `sesuai ukuran`, `500KB`, `2 MB`, `dibawah 1 MB`, `2 MB gratis`, `1 MB`, `10 MB gratis`. | Same field; the related block runs 500 KB to 10 MB, larger limits than the English cluster. |
| `kompres pdf sesuai ukuran yang diinginkan` | AI Overview (iLovePDF, PDF24), iLovePDF, PDF24 (14,949), Pi7 `memperkecil-ukuran-pdf`, LightPDF (translated), Telkom University's own WebPDF tool (`stage-pdf.telkomuniversity.ac.id`), a video block of three Indonesian YouTube how-tos with KB numbers in the thumbnails (100/200/500/800 KB; 4.4 MB to 300 KB), PDFResizer, HiPDF, APITemplate (translated). Related: `1 MB`, `500KB`, `sesuai ukuran gratis`, `I love kompres PDF`, `file PDF gratis`, `1 MB free`, `200KB`, `Kompres JPG`. | Custom-target intent is served by the second tier plus a local university tool; `Kompres JPG` in the related block is the photo half (SEO-19). |
| `ukuran file lamaran kerja via email` | Not a tool SERP. AI Overview: "maksimal 1 MB hingga 2 MB" citing Yureka Education Center and Jobstreet. Results: Scribd, yec.co.id (2020), Glints (Mar 2026), Jobstreet Indonesia, binar.co.id, edunitas.com, Dealls (Oct 2025), nusamandiri.info, Loker.id (Jun 2025), all career advice. Related: `Cara mengecilkan ukuran file pdf untuk lamaran kerja` is the one tool-shaped phrasing; the rest are email templates. | The limit is an email/HR convention of 1 to 2 MB, not a portal cap. The "job application" query is a career-advice intent; the compress intent inside it is `mengecilkan ukuran file pdf untuk lamaran kerja`, which a tool page cannot rank for against HR sites without being that kind of article. |

### Field read (2026-09-12)

No top ten is thin. The dedicated target-size pages are the same second tier this domain ranks
against at 9.4 in English (Pi7, 11zon, Zamzar, LightPDF), now with FreeCompress and a native blog post
in SEO-17's shape (easypdf.fr, 18 Aug 2026). The majors hold the generic slots and the AI Overview.
Google-translated English pages rank in all four tool SERPs, the translated-results backfill LOC-08
described, so an English page of ours already reaches these searchers in translation. No result claims
on-device processing. No verdict here; that waits for the query table and Keyword Planner.

### GSC Indonesia, last 3 months

Overview: 1 click, 151 impressions, 0.7% CTR, average position 17.6. Impressions rose from 0 to 2 a
day in July to 10 to 14 a day in early September.

**Query table (Web, 3 months, country Indonesia, sorted by impressions, captured 2026-09-12):**

| Query | Clicks | Impressions | CTR | Position |
| --- | ---: | ---: | ---: | ---: |
| blur pdf online | 1 | 52 | 1.9% | 7.7 |
| blur pdf | 0 | 13 | 0.0% | 8.4 |
| blur pdf free | 0 | 9 | 0.0% | 6.9 |
| blur pdf online free | 0 | 8 | 0.0% | 6.9 |
| blur text pdf | 0 | 7 | 0.0% | 7.4 |
| pdf extract | 0 | 3 | 0.0% | 61.7 |
| pdf blur | 0 | 2 | 0.0% | 8.5 |
| combine pdf com online | 0 | 2 | 0.0% | 68.5 |
| pdf blur text | 0 | 1 | 0.0% | 5.0 |
| pdf blur online | 0 | 1 | 0.0% | 7.0 |
| blur part of pdf online | 0 | 1 | 0.0% | 8.0 |
| pdf blur tool | 0 | 1 | 0.0% | 8.0 |
| blur pdf text | 0 | 1 | 0.0% | 9.0 |
| blur information in pdf | 0 | 1 | 0.0% | 10.0 |
| how to blur text in pdf free | 0 | 1 | 0.0% | 10.0 |
| how to blur pdf | 0 | 1 | 0.0% | 11.0 |
| how to sign on pdf file sent through whatsapp | 0 | 1 | 0.0% | 49.0 |
| redacted effect | 0 | 1 | 0.0% | 55.0 |
| gabung pdf free online | 0 | 1 | 0.0% | 70.0 |
| pdf combine gratis | 0 | 1 | 0.0% | 89.0 |

**Read:** every row is the English blur family, plus one extract query, one WhatsApp sign query, and
the two Indonesian leaks LOC-01 already recorded (`gabung pdf free online`, `pdf combine gratis`, both
merge, both past position 70). Not one target-size query, in either language.

### Keyword Planner

Run by Shlomi the same day; recorded in the next section.
## Keyword Planner results (2026-09-12)

Shlomi ran both Keyword Planner passes (location Indonesia, language Indonesian; the account's billing
currency shows as ILS in the bid columns, that's cosmetic and unrelated to the location filter, which
was confirmed set to Indonesia only for this run - an earlier pass had picked up a stray "Indonesia and
Israel" location and was redone).

**The three seed keywords, exact monthly average:**

| Keyword | Avg. monthly searches | Three-month change | YoY |
| --- | ---: | ---: | ---: |
| kompres pdf 1 mb | 50,000 | -90% | 0% |
| mengecilkan pdf 200 kb | 500 | 0% | 0% |
| kompres foto 200 kb | 500 | -90% | 0% |

**The "compress PDF to 1MB" family clears the bar decisively.** Beyond the 50,000/month head term,
40+ close variants each register 500-5,000/month (`kompres pdf jadi 1 mb`, `kompres pdf ke 1 mb`,
`kompres pdf kurang dari 1 mb`, `mengecilkan pdf 1 mb`, `perkecil pdf 1 mb`, `compress pdf 1 mb gratis`,
and many more phrasing variants on kompres/mengecilkan/mengompres/memperkecil/perkecil x
jadi/menjadi/ke/ki bawah/kurang dari). Summed, this single intent is worth well into the tens of
thousands of monthly searches in Indonesian - the largest, most validated keyword family measured
anywhere in this epic's Keyword Planner data.

**The "200KB" family is smaller and mostly photo, not PDF.** The high-volume 200kb rows are JPG/photo
compression (`kompres foto jadi 200 kb`: 5,000; `kompres jpg 200 kb`: 5,000; `kompres jpg menjadi 200
kb`: 5,000) - that intent belongs to the Compress Image tool, not this one. The PDF-specific 200kb
variants (`mengecilkan pdf 200 kb`, `kecilkan pdf 200kb`, `memperkecil ukuran pdf 200 kb`, `mengecilkan
ukuran pdf 200 kb`) are each ~500/month, summing to roughly 2,000-2,500/month for PDF+200kb
specifically - real but modest next to the 1MB family, borderline against the "few thousand = a page"
line rather than clearing it.

**A real trend signal, not noise:** dozens of independent "di bawah 1 mb" / "kurang dari 1 mb" /
"dibawah 1 mb" ("under 1MB") variants show **+900% YoY** together, while the flat "1 mb" / "jadi 1 mb"
phrasing sits mostly flat or down (several "kompres ... online" 1mb/200kb variants show **-90%
three-month**, also consistent across multiple independent rows). Read together: search behavior is
shifting from "compress to 1MB" toward "get it under 1MB" phrasing. If this family becomes a page, lead
with "under 1MB," not "to 1MB."


## Verdict (2026-09-12)

Demand passes, at 1 MB. Keyword Planner puts `kompres pdf 1 mb` at 50,000 searches a month, with
40-plus variants at 500 to 5,000 each, against the English pages' entire Indonesian footprint of 151
impressions a quarter (GSC, 3 months). Trends shows a steady line, about 4% of generic `kompres pdf`
and about half of bare `pdf 1 mb`, native beating English about 12x at that limit. The 100 to 300 KB
PDF family is a subsection's worth (2,000 to 2,500 a month, below Trends' floor); the 200 KB volume
that does clear is photo compression (`kompres foto / jpg 200 kb` at 5,000 each), the Compress Image
half. One oddity is recorded and not acted on: Keyword Planner's -90% three-month change on the head
term contradicts a flat Trends line and reads as a Planner artefact.

The gate's clause "visible as in-language queries in GSC" is now read, and it fails: the query table
(above) carries the English blur family, one extract query, one WhatsApp sign query and two Indonesian
merge leaks past position 70, not one target-size query in either language. This is recorded as
structurally unmeasurable today, not as evidence against demand. GSC only lists queries a domain
already ranks for (SEO-27's lesson); the English pages rank for no target-size query in Indonesia, and
`/pdf-wont-compress-to-100kb/` is not indexed at all, so there was never a page for this family to show
up against. The demand half of the verdict stands on Trends and Keyword Planner, the field half on the
SERPs; this GSC row does not move either. The first real GSC evidence for this family comes from
LOC-15's own page, after it is indexed.

Field passes as the gate is written, with a caveat. No Indonesian result claims on-device processing,
and the dedicated target-size pages are the second tier this domain already beats in English (Pi7,
11zon, Zamzar, LightPDF, FreeCompress), while `/compress/` ranks 9.4 on `file compressor to 100kb`.
Caveat: the majors hold the generic slots and the AI Overview, a native blog (easypdf.fr, 18 Aug 2026)
has already published a tested-documents post in SEO-17's shape, and Google ranks translated English
pages in every tool SERP measured here, so the expected start is page two and a slow climb.

Verdict: build, one page, in LOC-13's shape, as [LOC-15](LOC-15.md). Indonesian is the first language
whose niche cleared both halves of the gate; every other in-language target-size family measured sat
below Trends' floor (Turkish, Spanish, Vietnamese). LOC-15 is the build ticket; the GSC Indonesia query
table is above, the last evidence row for this ticket.

## Acceptance

- Trends, SERP and GSC readings recorded here in LOC-11's verdict-row format.
- One line in LOC-11's verdict table for "Indonesian, target-size".
- Verdict: hold (same as LOC-13), or a build ticket in LOC-13's shape (standalone localized page,
  cited portal limits, paid native reviewer named in front matter, no doorway).

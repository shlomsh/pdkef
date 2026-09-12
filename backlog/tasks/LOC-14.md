---
id: "LOC-14"
title: "Indonesian target-size compress: run the ROI gate on the size-limit family autocomplete surfaced"
status: "open"
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

This satisfies the Keyword Planner half of the ready-to-click links above. Trends, SERP and GSC
readings are still outstanding before the gate can be read; see Acceptance.

## Acceptance

- Trends, SERP and GSC readings recorded here in LOC-11's verdict-row format.
- One line in LOC-11's verdict table for "Indonesian, target-size".
- Verdict: hold (same as LOC-13), or a build ticket in LOC-13's shape (standalone localized page,
  cited portal limits, paid native reviewer named in front matter, no doorway).

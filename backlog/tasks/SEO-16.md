---
id: "SEO-16"
title: "Positioning review: Merge, Split and Protect & Unlock"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "later"
depends_on: ["SEO-11", "SEO-39"]
---

# SEO-16 · Positioning review: Merge, Split and Protect & Unlock

*Re-filed 2026-09-12* from `search-acquisition` into `english-base`: after SEO-35, the merge half of this review is settled: say it has only the general claims and stop.

## Scope and acceptance

**Run as a dedicated review, per SEO-11.** Last of the review tickets, and deliberately so: these three
are the most commoditised tools in the suite and the ones where our differentiators are the general four
rather than anything tool-specific. That is a legitimate finding, and this review is allowed to reach it.

Current standing: `/merge/` 47 impressions at position 36.13, no clicks. `/split/` 203 at 65.54, no
clicks. `/unlock/` 81 at 34.58, one click.

**What is already covered elsewhere**, so this review does not redo it: SEO-09 owns `/split/`'s extract
vocabulary, SEO-10 owns `/merge/`'s no-limit framing. Both should have shipped before this starts. This
review is the wider read of all three together.

**Unlock is the one with an unexamined story.** It handles both directions - add a password, remove one
you know - and auto-detects which. It also refuses to crack anything, and the query log shows people
arriving on `crack pdf` (position 90) and `pdf crack`. The refusal is the correct product decision and
saying it clearly is both honest and a differentiator, since it sets an expectation before someone wastes
their time. Whether it is worth *ranking* for those queries is a separate question the review should
answer, and "no" is a reasonable answer.

**The thing to resist.** These are the tools where a reviewer under pressure to produce a finding will
invent a differentiator. If Merge is simply a good, free, private merge tool with no cap, the correct
output of this review is to say so, sharpen the copy, and stop. An overclaim on a commodity tool costs
more credibility than it buys clicks.

**Acceptance.**

- SEO-11 method followed and recorded for all three.
- For each, either a named differentiator with evidence, or an explicit statement that it has only the
  general claims. Both are acceptable outcomes; a manufactured one is not.
- A recommendation on whether `/unlock/` addresses password-cracking intent at all, with reasoning.
- No overlap with SEO-09 or SEO-10; where this review disagrees with what they shipped, it says so
  rather than silently re-editing.
- Concrete copy as a diff; `npm run test:seo` passes.

## 2026-10-01 board cleanup

- depends_on: SEO-09 and SEO-10 replaced by SEO-39 (the merged 2026-10-08 read). Merge was settled by SEO-35.

## SERP captures, 2026-10-08 (from SEO-39's read)

Shlomi's screenshots, signed in, from Israel, so positions here are indicative and Search Console's are
the record. Context: `/merge/` reached page one between 09-08 and 10-05 (36.1 to 7.3, 2,216 impressions,
0.5% CTR) on a title Google has held since before 09-12; a recrawl of the live title was requested on
10-08. `/unlock/` is page one on `password protect pdf free` (81 impressions at 4.09, no clicks).

- **`merge pdf online`** (Search Console, 7 days: 3 clicks, 354 impressions, 4.9). Four sponsored results
  fill the first screen (Smallpdf, TheBestPDF, PDFaid with stars, OpenPDF). Organic opens with iLovePDF,
  Smallpdf (4.8, 716,022) and PDF24 (5.0, 24,130); we sit below them, out of the capture.
- **`merge pdf free`** (7 days: 1 / 266, 6.0, up 2.2). iLovePDF, PDF24, Smallpdf, FreePDFConvert, PDFgear
  (4.9, 10,143: "Files are processed locally in your browser"), Jotform, ihatepdf.cv ("No upload to any
  server, no watermark, no sign-up. Works offline."), CamScanner, Pipefile. Not on page one in this
  capture. Two neighbours already say our on-device line.
- **`password protect pdf free`**. An AI Overview citing Adobe, Smallpdf and iLovePDF; then iLovePDF,
  Smallpdf (4.2, 13,722), Adobe (4.7, 9,183), PDF24 (4.9, 754), Canva, People also ask, three videos,
  pdf2go, Microsoft Store, PDF Pro. Not on page one in this capture. "People also search for" leans to
  "protect PDF from editing" and "from copying", which Protect does not set (it adds an open password).

**Read.** Merge's 0.5% is the shape of the SERP: ads on the head term, three incumbents with review
stars above us, and neighbours already making the on-device claim. The same family of reasons blur had,
with stars we will not fake. No copy change before the 2026-11-07 read of `/merge/` CTR on the live
title. For Protect, the edit and copy restriction phrasing is demand for something the tool does not do
today; noted, not proposed.

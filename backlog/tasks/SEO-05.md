---
id: "SEO-05"
title: "Read 2026-10-08 · The 100KB cluster ranks and does not convert, and the page implies something untrue"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# SEO-05 · Read 2026-10-08 · The 100KB cluster ranks and does not convert, and the page implies something untrue

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, read date 2026-10-08: shipped; same recrawl exposure as SEO-04.

## Scope and acceptance

**`/compress/` is the site's second-best page and it is leaving most of the cluster on the table.**
12 clicks from 326 impressions at position 10.39. Inside that, `compress pdf to 100kb free` drew 16
impressions at position 9.88 for zero clicks, `100 compress pdf` 10 at 8.10 for zero, `100kb compress
pdf` 6 at 10.00 for zero. Same shape as SEO-04: page one, no clicks. Diagnose it the same way - look at
the rendered SERP first, form a hypothesis, then edit.

Note what the page already has, so this ticket does not re-do finished work. The title is
`Compress PDF to 100KB Free - Reduce File Size | PDkef`, the h1 matches, and `compressPdfToTarget()` in
`src/lib/compress.js` implements a real DPI ladder with a binary quality search, 100 KB / 200 KB /
500 KB / 1 MB quick-picks, a 20-second budget and an honest `metTarget: false` surfaced in the UI. The
capability is genuinely there and genuinely better than most of what ranks above us.

**The second half is a correction, not an optimisation.** The research names
`compress pdf without losing quality` (45k-110k/mo) as a target, and it is one we must not chase on
those terms. PDkef's compressor rasterizes: pages become JPEG images, so selectable text, embedded
links and screen-reader access are gone. The FAQ says this. The framing around it should say it too,
plainly and early, because a visitor who arrives on that query and downloads a file whose text no
longer selects has been misled by us, and that is worse than not ranking. Say what is lost, say when
the tool returns the original untouched (already under the target), and let the honesty be the
differentiator - most competitors ranking for that phrase do not mention it either.

**Acceptance.**

- Rendered SERP for `compress pdf to 100kb free`, `100 compress pdf` and `file compressor to 100kb`
  recorded for us and our neighbours before any edit, with a stated hypothesis for the zero CTR.
- The page states, above the FAQ, that compression rasterizes and what that costs. No phrasing anywhere
  on the page implies lossless compression.
- The already-under-target passthrough is stated where a visitor will see it, since it is the one case
  where nothing is lost.
- FAQ changes mirrored into `<SeoSchema>`; `npm run test:seo` passes; primary keyword still in title,
  single `<h1>` and meta description.
- Before and after CTR for the cluster in the SEO-02 table at the next refresh.

## Diagnosis and change (2026-09-10)

**Same access limitation as SEO-04**: direct Google SERP capture was blocked by bot-detection this
session, so this is diagnosed from our own confirmed served title/meta (via `curl`) plus real organic
results for the same queries on DuckDuckGo, cross-referenced against the competitor names GSC's own data
already puts above us for this cluster (smallseotools, PDNob, DocHub - findings doc section 3).

**What the field actually looks like.** `compress pdf to 100kb free` is an extremely saturated SERP: at
least ten dedicated tools compete on the DuckDuckGo results alone (ExactPDF, Adobe, Smallpdf, TenXPDF,
Noderail, Zamzar, iLovePDF, AngelPDF, Pi7), and the claims have converged into a commodity set - "free",
"no upload", "no signup", "portal limits", "government forms", "in your browser" all appear multiple
times, nearly word-for-word. Our own meta already used this exact vocabulary ("target-size option for
portal limits... No upload, signup, or watermark"), which means it read as one more instance of the same
snippet the searcher had already seen five times above us, not a reason to pick us specifically.

**The other thing that stood out**: several competitors imply guaranteed success or lossless output
outright - Smallpdf's own snippet says "without quality loss" - even though a target-size compressor
realistically has to trade quality for size the same way ours does. None of them state what happens if
the target can't be hit. PDkef's compressor actually tells the user honestly when it missed the target
(`metTarget: false`, surfaced in the UI) instead of silently returning something oversized or degraded
past readability - that's a real, checkable claim none of the sampled competitor snippets make.

**Hypothesis (single change, testable):** the snippet blends into an already-commoditized set of
near-identical claims. Leading with the one claim that's both true and absent from every competitor
snippet sampled - an honest signal when the target isn't reachable, instead of a silent or vague
promise - should differentiate it in a scan of otherwise-interchangeable results.

**New meta (shipped):** *"Compress PDF to 100KB free, right in your browser. If it can't hit the target,
we say so instead of guessing. No upload, signup, or watermark."* (title unchanged - `Compress PDF to
100KB Free - Reduce File Size | PDkef` already matches the keyword and wasn't touched, per "specific
hypothesis, not a general rewrite").

**Second half - the rasterization correction.** `aboutLead` in `src/data/tools.js`'s compress entry
(rendered in the "How it works" card, above the FAQ, directly under the H2) now reads: *"Reduce the file
size of your PDFs, right in your browser. No upload, no server. To reach a small target, pages are
turned into images, so selectable text and links are lost on any page that changes. If your file is
already under the target, it comes back untouched - nothing lost."* This states the rasterization cost
plainly and early (above the FAQ, not buried in FAQ item 5 where it already existed) and states the
one case where nothing is lost, per the ticket's acceptance criteria. No claim on the page implies
lossless compression. `npm run test:seo`, `test:csp`, `test:css` and `test:weight` all pass against a
fresh build with this change in.

**Not done:** before/after CTR needs a GSC refresh - same open dependency as SEO-01 and SEO-04.
Re-measurement date: **2026-10-08**.

*Update 2026-09-10:* Shlomi's fresh Search Console export the same day (see SEO-01) reconfirmed the
cluster numbers above exactly (16/9.88 for "compress pdf to 100kb free", etc.) - pre-change baseline
confirmed from the primary source. "After" side waits for the 2026-10-08 refresh.

*Update 2026-09-11 (from SEO-04):* `/compress/` may have the same exposure SEO-04 uncovered on
`/redact/` - Google was serving an indexed title and description from before 2026-08-29 there, so a
shipped snippet change was invisible in the SERP. **Before reading the 2026-10-08 CTR as a verdict on
this edit, check that the indexed snippet actually changed**: search the cluster's top query and compare
the displayed title against what `curl https://pdkef.com/compress/` serves. A flat CTR against a stale
snippet means "not yet recrawled", not "the hypothesis was wrong".

*Confirmed 2026-09-11, not just suspected:* URL Inspection shows `/compress/` last crawled on
**2026-08-09**, a month before this ticket's 2026-09-10 change. The snippet fix has never been indexed.
Indexing was requested the same day. Do not read the 2026-10-08 CTR until the indexed title has changed
(SEO-01 has the full sweep and `npm run seo:crawl-staleness` the instrument).

*Interim signal, 2026-09-11 - logged, not a verdict.* Shlomi's Search Console screenshot (28-day view,
filtered to the query `file compressor to 100kb`) shows 4 clicks / 95 impressions, 4.2% CTR, avg.
position 9.4, with the daily trend showing zero clicks before roughly 2026-09-02 and climbing through
2026-09-07/08. SEO-13's word-for-word capture of this same query from the 2026-09-10 export had it at
81 impressions, position 9.60, **zero** clicks - so this is real movement, not noise. It predates the fix
above being indexed (confirmed stale as of today, this same update), so it cannot be attributed to this
ticket's snippet change or to SEO-13's copy change; log it as a pre-fix baseline for the 2026-10-08
comparison and re-check whether the climb continues once the indexed snippet actually changes. Folded
into `docs/seo-competitive-findings.md` section 2.

*Competitive context, 2026-09-11.* Shlomi also supplied a real Google SERP screenshot for
`compress pdf free online` (mobile, dark mode): top four organic results are iLovePDF ("Compress PDF
online. Same PDF quality less file size"), PDF24 Tools ("100% free & online... No limits and no
watermarks", 4.9★/14,951 reviews), Smallpdf ("Reduce PDF File Size with Free Compressor... browser-
based"), Adobe. **This is not one of this ticket's three target queries** (`compress pdf to 100kb free`,
`100 compress pdf`, `file compressor to 100kb`) - it's the broader head term, not the 100KB-target
cluster - so it doesn't close the "rendered SERP for the three queries" acceptance item, but it's a
useful independent cross-check: the same four players (iLovePDF, PDF24, Smallpdf, Adobe) that the
DuckDuckGo-proxy sampling on 2026-09-10 found for the target-size queries also show up here on real
Google, which is some confirmation the proxy sampling wasn't misleading. PDF24's star rating is the one
new data point - a competitor showing review-count social proof that we deliberately don't fake (CLAUDE.md,
"do not emit `AggregateRating`" - see section 2 of the findings doc). Real Google screenshots for the
exact three target queries are still the open item; ask Shlomi for those when convenient rather than
treating this broader capture as satisfying it.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped and indexing requested; nothing left to build. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.

## Interim read 2026-09-17: recrawled on 09-12, no movement yet

From Shlomi's 2026-09-17 exports (Coverage -> Valid; Performance, last 7 days, 2026-09-09 to 09-15).
`/compress/` was crawled on **2026-09-12**, so the 2026-09-10 snippet change has been in the index for
three of the seven days in this window. In that window the 100KB cluster is 2 clicks on 178 impressions
at 9.9 (`compress pdf to 100kb` alone: 0 clicks on 84 at 9.58; `file compressor to 100kb`: 1 on 9),
and `/compress/` is 7 clicks on 309 at 9.64, against 10.14 over the three months. No change on the
cluster, and three days is too short to read as one. What changed is the status of the 10-08 read: it
is now a verdict on the copy, not on the crawl. Do not layer another rewrite before it.

## The real SERP, captured 2026-09-17: a rank gap, not a snippet gap

Shlomi ran `compress pdf to 100kb` by hand (signed in, Google's footer says results are personalised).
Page one, top to bottom: Adobe (`Compress PDF to 100KB Online - 100% Free at Acrobat.com`, 4.6 stars,
281,831), bigpdf.11zon.com, Duplichecker, iLovePDF, Aback Tools (`Compress PDF to 100KB`, snippet
*"ideal for government portals, KYC uploads, and job application systems with strict size limits"*),
SmallSEOTools, Zamzar, PDF24 (4.9, 14,972), an AI Overview citing Adobe and PDFgear, then pdfkits.app.
**PDkef is not on page one in this capture.** GSC's 7-day average is 9.58, which is the same thing said
in numbers: the page-one boundary.

What that changes. Every organic title above is the exact phrase `Compress PDF to 100KB`, and every
snippet says upload. Our title already matches the phrase. At position ten nobody scrolls to the
snippet, so the 2026-09-10 meta hypothesis cannot be tested by CTR from here, and a flat CTR on 10-08
will not be evidence against it. This ticket's zero-click is a rank gap at the boundary, in a field of
exact-match titles plus review stars, which is authority (SEO-03) territory. Two smaller observations
for later, not now: "People also search for" carries `Compress PDF to 100KB free offline`, a phrasing
where the installable app is a true claim nobody above us can make, and `Compress JPG to 100KB`, which
is SEO-19's demand. Aback Tools has taken the portal-limits angle in its snippet; SEO-17's page is the
right answer to that once it is indexed. No copy change on `/compress/` from this.

## The pre-copy baseline, from Shlomi's compare view (2026-09-17)

Search Console, page filter `/compress/`, week over week, captured 2026-09-17:

| Week | Impressions | Clicks | CTR | Position |
| --- | ---: | ---: | ---: | ---: |
| 8/27 to 9/2 | 42 | 3 | 7.1% | 10.7 |
| 9/3 to 9/9 | 365 | 10 | 2.7% | 9.7 |

The daily line steps from about 36 to 68 between **9/6 and 9/7**. `/compress/` was crawled on 08-09
and not again until 09-12, so this is Google re-scoring the page it already held, not reading anything
we shipped: the 09-10 meta, SEO-13's line and SEO-33's vocabulary all postdate the step and none can
claim it. The page was admitted to a much wider query set at the page-one boundary; nine times the
impressions, three times the clicks, and the marginal impressions convert at about 2%, which is what
position ten looks like. The 7.1% on the earlier week is three clicks on 42 impressions, noise.

The 7-day export for 9/9 to 9/15 (309 impressions, 7 clicks, 2.27% at 9.64) says it held. **So the
baseline the 10-08 read compares against is about 350 impressions a week at position 10 with 2 to 3%
CTR**, not the 326-in-three-months the scope above was written from. A CTR read against the 42-a-week
figure would show a collapse that is really a denominator change.

Same shape as the site-wide chart, which rose from 9/2 onward before any request: Redact's re-score
came with a bought recrawl, Compress's came without one. Two mechanisms, and the second is the domain
being re-weighed, which is SEO-03's lever, not this ticket's.

## Addendum 2026-09-19: compress FAQ and subhead closer changed

SEO-36 swapped the `/compress/` subhead's "Private: your file never leaves your device." for the shared closer and reworded the "Is the PDF compression secure?" FAQ into "Is my PDF uploaded anywhere?" without intensifiers. Title, h1, description and the honest-miss line are untouched; the 10-08 position read is unaffected by design.

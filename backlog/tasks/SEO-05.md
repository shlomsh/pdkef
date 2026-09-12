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

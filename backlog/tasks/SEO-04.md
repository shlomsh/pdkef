---
id: "SEO-04"
title: "Read 2026-10-08 · Thirteen blur queries are on page one and earning zero clicks"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# SEO-04 · Read 2026-10-08 · Thirteen blur queries are on page one and earning zero clicks

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, read date 2026-10-08: shipped; verdict needs the indexed title to change first.

## Scope and acceptance

**This is the cheapest win available on the site, and no keyword research could have found it.** In the
three months to 2026-09-07, thirteen blur and blackout queries ranked between position 5.8 and 11.4,
drew 160 impressions between them, and returned **no clicks at all**:

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

Position 6 with a 0% click-through is not a ranking problem. Something about the result as it appears
in the SERP is losing to whatever sits around it. `/redact/` overall converts at 3.5%, so the page is
not uniformly bad - these specific phrasings are.

**Diagnose before rewriting.** Look at what actually renders for these queries: Google frequently
rewrites titles, so the `seoTitle` in `src/data/tools.js` may not be what a searcher sees. Check the
live SERP for the three highest-impression queries above, record what is displayed for us and for the
results ranked around us, and only then decide what to change. It is entirely possible the answer is
the description rather than the title, or a missing element the neighbours all have.

**The current title is `Blur PDF Online Free - Blackout & Redact Text | PDkef` and the h1 matches.**
Both already lead with blur (DEMO-07). So resist the reflex to re-do DEMO-07's work; the question here
is narrower and is about the snippet, not the keyword.

**Second half: the word "permanently".** The research identifies `permanently redact pdf` (15k-35k/mo,
Adobe and Sejda ranking) and `/redact/` never uses the word, despite doing the thing - a page carrying
a blackout, blur or whiteout box is flattened to an image on export, so the text underneath is gone
rather than covered. The FAQ explains the mechanism at length; it does not use the term people search,
and it does not give the reader a way to check. Add both: the searched wording, and the test - export
the file, open it, search for the redacted word, and find nothing. A test the reader can run is worth
more than any assurance, and it is exactly the register the voice rules ask for.

Keep the existing honesty about blur specifically: blur alters pixels rather than removing them and is
not a substitute for a solid blackout. That caveat stays prominent. It is also a differentiator, since
most competitors do not say it.

**Acceptance.**

- What Google actually displays for `blur text in pdf`, `blur text in pdf online free` and
  `pdf blur tool` is recorded in this ticket, for us and for the two results adjacent to us, before any
  edit.
- The change is a specific hypothesis, stated here, about why the snippet loses - not a general rewrite.
- `/redact/` uses "permanently" in copy that is true of what the tool does, and carries a reader-runnable
  verification test. The blur-is-not-removal caveat is still present and still prominent.
- Any FAQ change is mirrored into `<SeoSchema>`; `npm run test:seo` passes; the primary keyword stays in
  the `<title>`, the single `<h1>` and the meta description.
- Before and after click-through for all thirteen queries recorded in the SEO-02 standings table at the
  next refresh. If CTR has not moved in four weeks, the hypothesis was wrong - say so here and try the
  other one rather than declaring victory on the edit.

## Diagnosis and change (2026-09-10)

**What I could and couldn't observe.** Fetching Google directly for these queries returned a bot-
detection interstitial ("unusual traffic from your computer network"), so I could not capture the
literal rendered SERP for us or our Google-ranked neighbours as the ticket asks. What I could confirm
directly: our own served `<title>` and meta description (via `curl`, not a crawler simulation), and the
real organic snippets competitors use for these exact queries on Bing and DuckDuckGo, which - while not
Google's index or ranking for us - do show what the *rest of the field* is currently saying in this
SERP, since GSC's own record of who outranks us on Google (`docs/seo-competitive-findings.md` section 3)
overlaps heavily with names that also show up here (DocHub, Smallpdf, iLovePDF, PDF24, plus several
blur-specific challengers: DonePDF, BlurIt, blur-face.com, BlurPen).

**Old title/meta (confirmed served):** title `Blur PDF Online Free - Blackout & Redact Text | PDkef`
(unchanged - it already leads with the keyword, DEMO-07's work, not re-touched). Meta: *"Blur PDF online
for free, black out text, or delete selectable elements. No upload, signup, or watermark. Marked pages
flatten on download. Open source."*

**Two concrete defects in that meta description, found by comparing it against the field:**

1. *"delete selectable elements"* is internal/mechanism language, not a phrase a searcher recognises,
   and it front-loads a third capability (Delete) ahead of the two the query cluster actually names
   (blur, blackout) - diluting the one clear promise competitor snippets lead with (e.g. DonePDF: "Blur
   or redact sensitive information... FREE tool, no watermarks, no registration"; BlurPen: "Blur,
   pixelate, or blacken sensitive areas... free, in your browser, no uploads, no account").
2. *"Marked pages flatten on download"* is an implementation detail (how the export is built) stated as
   if it were a benefit. It costs character budget without persuading anyone to click, and nothing in
   the competitive set states anything like it.
3. *"No upload"* is no longer a differentiator on its own for this specific cluster - blur-face.com and
   BlurPen already claim in-browser/local processing in their own snippets. It's table stakes here, not
   a hook, and shouldn't be the meta's centrepiece.

**Hypothesis (single change, testable):** the snippet loses CTR because it opens with an internal
mechanism list rather than the plain single-action promise the query names, and spends its limited
character budget on a sentence ("Marked pages flatten on download") that means nothing to a searcher.
Rewriting to lead with the plain action and drop that sentence should move CTR without any ranking-
relevant keyword change.

**New meta (shipped):** *"Blur, black out, or permanently delete text in a PDF for free, right in your
browser. No upload, signup, or watermark. Open source."* ("delete selectable elements" → "permanently
delete text"; dropped the flatten sentence; "right in your browser" replaces the bare "No upload" as the
lead-in, since it reads as a stated capability rather than an absence.)

**Second half - "permanently".** `src/data/tools.js`'s redact FAQ answer to "Can someone remove the blur
or black box after download?" now opens "No. Blackout and Whiteout permanently redact the page..." and
gives the reader-runnable test the ticket asked for: open the downloaded PDF and search for the covered
word, and it won't be found, because the page was flattened to an image with no text layer underneath.
The existing blur-is-not-removal caveat is unchanged and still present in the same answer. This mirrors
into `<SeoSchema>` automatically (the FAQ schema is generated from the same `tool.faq` array) - verified
in the built `dist/redact/index.html`'s JSON-LD. `npm run test:seo`, `test:csp`, `test:css` and
`test:weight` all pass against a fresh build with this change in.

**Not done:** the "before and after CTR" measurement needs a GSC refresh at least a few weeks after this
ships to production - tracked as the same open dependency as SEO-01's baseline (see that ticket).
Re-measurement date: **2026-10-08** (four weeks from today), to land with SEO-01's own re-measurement.

*Update 2026-09-10:* Shlomi pulled a fresh Search Console export the same day (see SEO-01). All thirteen
queries' impressions/position above matched exactly - this is the pre-change baseline, confirmed from
the primary source rather than just the doc. Nothing to compare yet; the "after" side needs the
2026-10-08 refresh, after the meta description change above has had time in production.

## The real SERP, captured at last (2026-09-11)

The 2026-09-10 pass could not see Google and said so honestly. Shlomi ran the three queries by hand and
supplied the rendered SERPs, so acceptance criterion 1 is now met. **The evidence overturns the shipped
diagnosis.** Recording it in full, then what follows.

### What Google displays for us

Identical on `blur text in pdf` and `pdf blur tool`:

> **Blackout, Blur, or Redact PDF Online | Free & Private - PDkef**
> Securely hide text in your PDF files. Black out or blur sensitive information, and we permanently
> flatten the page so the data cannot be extracted.

**That is not our title, and not our meta description.** It is an exact match for `src/data/tools.js` at
`b4ffd96~1` - the state of the file *before* 2026-08-29:

| | Indexed (what searchers see) | Served live today (`curl`, verified) |
| --- | --- | --- |
| Title | `Blackout, Blur, or Redact PDF Online \| Free & Private` | `Blur PDF Online Free - Blackout & Redact Text \| PDkef` |
| Meta | `Securely hide text in your PDF files. Black out or blur sensitive information, and we permanently flatten the page so the data cannot be extracted. 100% private.` | `Blur, black out, or permanently delete text in a PDF for free, right in your browser. No upload, signup, or watermark. Open source.` |

(The `- PDkef` in the SERP is Google appending the site name; `BaseLayout.astro` did not add it at that
commit. The description is truncated before `100% private.`)

**So Google's index of `/redact/` predates 2026-08-29.** Both DEMO-07's title work *and* this ticket's
meta rewrite are invisible in the SERP. The live deploy is correct, so this is crawl staleness, not a
broken deploy.

On `blur text in pdf online free` the title is the same stale one, but the description is different
again - assembled from page body copy, not from any meta we have ever shipped:

> Free for everyone Black out or blur sensitive text in as many PDFs as you like, with no watermark or
> usage caps. choose "Blackout" or "Blur" from the toolbar.

### The field around us

`blur text in pdf` (32 impressions, GSC 11.44), top to bottom: iLovePDF *Redact PDF - Secure PDF
redactor*; **Videos carousel** (3 YouTube how-tos); Tungsten Automation *How to Blur Text in PDF: A
Step-by-Step Guide*; **AI Overview**; **us**; Smallpdf *Redact PDF: Remove Sensitive Information
Permanently*; PDF24 *Redact PDF - 100% free & online* with **4.9 ★★★★★ (741) · Free**; Adobe; PII
Blackout; DocHub. Adjacent to us: Tungsten above (with the AI Overview directly above us), Smallpdf below.

`blur text in pdf online free` (23, GSC 6.65): iLovePDF; **Videos carousel**; **us**; Smallpdf; DocHub;
PDF24 (stars); **AI Overview**; PDF4me; DataBlur *Redact PDF Online Free - True Redaction, No Upload*;
Sejda. Adjacent: the video carousel above, Smallpdf below. We are the **second organic result** here and
still take zero clicks.

`pdf blur tool` (17, GSC 8.47): iLovePDF; **us**; Tungsten; Smallpdf; **AI Overview**; DocHub; PDF24
(stars); jpegconvert; blur-face.com; a YouTube result; sponsored PDFaid. Adjacent: iLovePDF above,
Tungsten below. Second organic again.

### Revised diagnosis

Four things the 2026-09-10 hypothesis could not have known, in descending order of weight.

1. **The snippet under test is not in the index.** The rewrite addressed a description no searcher has
   been shown. Whatever is suppressing CTR, it is not the wording we changed, because that wording has
   never appeared. This makes SEO-04 downstream of SEO-01/SEO-06: the copy cannot be evaluated until
   `/redact/` is recrawled. The `lastmod` fix from 8e20612 is in the live sitemap
   (`2026-09-10T17:04:31.000Z`), so the lever is set; it needs time and probably a manual GSC indexing
   request for this specific URL.
2. **Google discards our meta on at least one of the three queries anyway**, preferring body copy. So
   meta edits are a partial lever here at best, and the intro paragraph in `src/data/tools.js` is doing
   snippet work whether or not we intended it to.
3. **An AI Overview sits on all three queries and cites us on at least two.** On `blur text in pdf
   online free` PDkef is the *first* tool it names, described accurately ("Runs locally in your browser
   for absolute privacy, allowing you to draw blur or blackout boxes and flatten the file so text cannot
   be copied"). That is the textbook zero-click pattern: the searcher gets both the answer and the
   attribution without visiting. It is a structural CTR suppressor that no snippet rewrite can reach,
   and it plausibly explains 0% at position 6 better than any wording defect. Being cited is a real
   asset for GEO purposes; it is not a click.
4. **Two of the three queries are video-led**, with a carousel above our result. Google reads these
   phrasings as how-to intent and we answer with a tool page.

One thing the ticket predicted correctly: *"a missing element the neighbours all have."* PDF24 carries
`4.9 ★★★★★ (741) · Free` review stars on all three SERPs and we carry no rich result of any kind.
**We should not chase that one.** We have no reviews, and emitting `AggregateRating` without them is
fabricated structured data. Noted and deliberately declined.

### What changes, and what does not

**No further copy edit.** Layering a second speculative rewrite on top of one Google has not yet seen
would confound the measurement this ticket exists to take, and the scope note warns against exactly that.

**The measurement plan was unsound and is corrected.** The acceptance criterion said that if CTR has not
moved in four weeks the hypothesis was wrong. That would now be the wrong inference: with a stale index,
a flat CTR on 2026-10-08 most likely means *not yet recrawled*. So the 2026-10-08 refresh must first
check whether the indexed snippet has changed, by re-running these three queries and comparing the
displayed title against the table above. Only once the SERP shows the live title is the CTR reading a
verdict on the copy at all.

**Open dependency:** request indexing for `/redact/` in Search Console (SEO-01's territory, needs
console access). Until that lands, SEO-04 is blocked on a crawl, not on copy.

*Resolved 2026-09-11:* Shlomi requested indexing for `https://pdkef.com/redact/` via URL Inspection.
Google reported *"URL is on Google"* and *"URL was added to a priority crawl queue"*. Note Google's own
wording on that dialog - resubmitting does not improve queue position - so this is submitted once and
then left alone. The 2026-10-08 check now has a defined first question: has the indexed title changed
from `Blackout, Blur, or Redact PDF Online | Free & Private` to the live one?

### A third staleness layer: the favicon in the AI Overview card

Shlomi spotted that the AI Overview's citation card for us carries the **old blue/grey logo**. Checked:
it is the pre-Sea-Glass mark, replaced by commit `610ea11` on **2026-07-09**, so Google's cached favicon
is over two months stale - older still than the pre-2026-08-29 title and description above.

Not our bug. `/favicon.ico`, `/icons/favicon-32.png` and `/icons/icon-192.png` on the live site are
byte-identical to the repo and all render the current green mark (verified by `curl` + `md5`, and by
rendering the `.ico`, which `e46c641` shipped on 2026-08-05 and which is correct).

Worth separating from the page-crawl finding, though it reinforces it: Google's favicon crawler is a
**separate** crawler from Googlebot, fetches from the site root on its own schedule, and caches
aggressively. There is no "refresh my favicon" control in Search Console. So this is the same
crawl-starvation story in a different costume rather than the same mechanism.

**Do not chase it by renaming the icon.** Google caches favicons by URL, so a new filename is the usual
cache-bust, but `BaseLayout.astro` points at a stable unhashed path on purpose (see the comment there),
and that stability is exactly what is holding the stale cache. Trading a deliberate decision for a guess
is not worth it while a recrawl of `/` should fix it anyway. Re-check the card at the 2026-10-08 refresh;
if the logo is still blue after `/redact/` and `/` have been recrawled, revisit then with evidence.

*Update 2026-09-11, later:* URL Inspection gives the exact number - **`/redact/` was last crawled on
2026-07-07**, 65 days before the capture and **two days before the 2026-07-09 logo change**. So the
separate-favicon-crawler reasoning above is not needed to explain the blue mark: the page copy Google
holds is from before the retheme in every respect. The full sweep is in SEO-01; nine of eleven crawled
pages are stale, and `/redact/` is the second-oldest of them despite carrying 64% of clicks.

`/` submitted for indexing too, so that condition is now set up to be testable
rather than hypothetical. If the card still shows the blue mark on 2026-10-08 with `/` recrawled, the
separate-favicon-crawler explanation is the one left standing, and the URL-rename cache-bust becomes a
decision to weigh on evidence instead of a guess.

## Which blur phrasing to optimise for, decided from the 2026-09-11 export

Shlomi asked whether `blur pdf online free` or `blur text in pdf online free` matters more, given the
first performs better. The 28-day "Top queries" view cannot answer that: it lists what we already win,
and we win `blur pdf` largely because the title and h1 already say it. The right lens is the queries we
are *losing*, so this uses the 3-month export of 2026-09-11 (`Queries.csv`, last 3 months, web) and
sums the zero-click rows by cluster.

| Cluster | Impressions won (clicks) | Impressions lost (0-click rows) | Share of own demand lost |
| --- | ---: | ---: | ---: |
| `blur pdf` and variants, no "text" | ~453 (20) | ~159 | ~26% |
| `blur text in pdf` and variants | ~40 (3) | ~102 | ~72% |

Generic blur is roughly four times the demand and already converts most of it; the "text" phrasing is
a quarter the size and loses nearly three quarters of what it gets. By absolute lost impressions the
generic cluster is still the bigger prize (159 against 102), so **the primary target does not change:
the title and h1 stay on `blur pdf online free`.** SEO-14 already argued the same conclusion from the
ranking side.

The "text" cluster is not one problem but two, and only one of them is this ticket's:

- `blur text in pdf online free` (24 impressions, position 6.79, 0 clicks) and `blur pdf online free`
  (24, position 7.00, 0 clicks) are **identical**. Page one, real impressions, no clicks, on both
  phrasings alike. That is the zero-click pattern the SERP capture above already explained (AI
  Overview and video carousel), and it is blocked on the recrawl like the rest of the thirteen.
  Twenty-four impressions in three months is also too small a sample to read a 0% as a verdict on
  either phrasing.
- **`blur text in pdf` itself (36 impressions, position 11.58, 0 clicks) is a rank gap, not a
  snippet gap.** It is the one row of the thirteen that sits on page two, and the SERP capture shows
  why: Google reads it as how-to intent (Tungsten's step-by-step guide and a video carousel above us)
  and we answer with a tool page. Closing it is a ranking question and the copy freeze on `/redact/`
  does not touch it.

**What shipped for the second point.** Not a `/redact/` edit; the freeze above stands. Every inbound
link to `/redact/` on the site read "Blur & Redact", "Redact tool" or "PDF redaction tool", so no
anchor on the site carried the word "text" at all, and the blur guide's own Blur section
(`src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml`) did not link to the tool. One
paragraph added there: how to blur text (choose Blur, drag a box over the words, no text-selection
step, zoom in on a phone), with the link text `blur text in a PDF`, and the blurred-pixels caveat
restated. It teaches the awkward fact rather than promising text selection the tool does not have.
That page is itself unindexed (SEO-06), so the anchor is worth little until it is crawled; it is the
right page for the sentence regardless, and it is the only lever that does not add a variable to
this ticket's measurement.

**Deliberately not done.** A how-to content page for `blur text in pdf` would match the SERP's intent
better than the tool page does, but SEO-14 measured the existing three-page redaction cluster and
found no room for a fourth, and SEO-06 has not yet shown the two existing guides can get indexed at
all. Revisit only at the 2026-10-08 refresh, and only if `/blur-vs-blackout-vs-delete-pdf/` is by
then indexed and drawing `blur text` impressions of its own; if it is, extend that page rather than
add one.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped and indexing requested; nothing left to build. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.

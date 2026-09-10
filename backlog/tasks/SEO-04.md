---
id: "SEO-04"
title: "Thirteen blur queries are on page one and earning zero clicks"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# SEO-04 · Thirteen blur queries are on page one and earning zero clicks

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

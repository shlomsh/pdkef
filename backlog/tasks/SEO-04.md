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

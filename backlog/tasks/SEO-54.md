---
id: "SEO-54"
title: "Academic paper reader: a visual guide to reading papers in Highlight PDF, and the /highlight-pdf/ audit fixes"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
depends_on: ["READ-03"]
---

# SEO-54 · Academic paper reader guide

*Filed 2026-11-02.* Shlomi asked for a page called "academic paper reader" that explains Highlight PDF's
purpose and features, highly visual, for people looking to highlight, annotate and comment on a PDF.

## Outcome

`/academic-paper-reader/` is a content-pages entry hung off `/highlight-pdf/`, with real screenshots of the
tool on an original sample paper (no real authors, data or citations): marking, the mark toolbar, a scanned
page before and after, the Reading lamp. Every claim is checked against `src/tools/highlight/`.

Demand note: "academic paper reader" is unmeasured in Trends; the measured terms are "highlight pdf" and
"annotate pdf" (findings doc 3.9), which the page carries in its title and body. Read GSC for the page after
it is indexed before adding more pages in this direction.

## Same change: /highlight-pdf/ audit (2026-11-02)

- The comments FAQ said "most PDF viewers"; the spec (READ-03, docs/highlight-pdf.md) says any viewer. Now "any".
- "annotate pdf" (secondary keyword) gets a FAQ, "PDF highlighter" (body phrase) the how-to lead, iPad step 1.

## Acceptance

- [ ] Page builds; `test:seo`, `test:redirects`, `test:css` pass.
- [ ] Independent review of copy and claims against the code.
- [ ] After landing: indexing request for `/academic-paper-reader/` and `/highlight-pdf/` (Shlomi).

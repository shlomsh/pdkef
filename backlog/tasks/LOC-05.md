---
id: "LOC-05"
title: "Publish the eight reviewed Hebrew guides alongside the Hebrew tool pages, so the edition cross-links"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-03"]
legacy_state: "Open"
---

# LOC-05 · Publish the eight reviewed Hebrew guides alongside the Hebrew tool pages, so the edition cross-links

## Scope and acceptance

**What this is.** [SEO-27](SEO-27.md) framed the decision on the eight Hebrew guide drafts in
`src/content/localized-pages/he/`; the decision is now yes (LOC-01, 2026-09-11), and the review pass is
this ticket's work. It also covers the part SEO-27 could not see:
once LOC-03's Hebrew tool pages exist, a Hebrew guide's `primaryCta` should point at `/he/sign/`, not
at the English `/sign/`, and the Hebrew tool page's guide cards should point at the Hebrew guides.
Today `localizedPages` entries link to `/sign/` because nothing else exists, and the design record's
rule is "a localized guide may link to an untranslated tool, but disclose the English destination".
With LOC-03 shipped that disclosure comes off and the links resolve within the edition.

**Order.** Do not publish the guides before the tool pages. Eight Hebrew guides pointing at an English
tool is the mixed-language experience this epic exists to beat. Publish them in the same window as
LOC-03, so the edition arrives whole and cross-linked from the first crawl.

**Acceptance.**

- Every published Hebrew guide's CTA and related-guide links resolve inside `/he/`; the English
  fallback label is shown only where a target really has no Hebrew edition.
- `hreflang` sets on the guides and tool pages are reciprocal across the whole edition (LOC-02's
  guard covers it; this ticket makes sure the fixture includes a guide-to-tool pair).
- One indexing request per URL, dated here. Outcome folded into LOC-03's eight-week read.

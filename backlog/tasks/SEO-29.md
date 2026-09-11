---
id: "SEO-29"
title: "Every ranking how-to competitor shows a visible date or byline; our content pages show neither"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-08"]
legacy_state: "Open"
---

# SEO-29 · Every ranking how-to competitor shows a visible date or byline; our content pages show neither

## Scope and acceptance

**Where this came from.** SEO-08's SERP read of "how to sign a pdf on android" (2026-09-11, recorded in
full there) found that all ten ranking results carry a visible freshness or authorship signal: SigPDF
and BasicDocs stamp a publish date, PrimeDocu and PDFgear an explicit "Last updated <date>", HowToGeek
a full author byline with credentials. None of our eight content-pages-collection pages (the four OS
guides plus `blur-vs-blackout-vs-delete-pdf`, `install-pdf-app`, `offline-pdf-form-filler`,
`open-source-pdf-editor`, `permanently-delete-text-from-pdf`, `sign-pdf-no-signup`) show anything like
it, even though the underlying freshness data already exists: `src/pages/sitemap.xml.js`'s
`lastmodFor()` derives an accurate, git-based last-modified date per content page today, purely for the
XML sitemap. Nothing renders it to a human reader.

**What this is not.** It is not proof that a visible date moves rank on its own - SEO-08 explicitly
did not claim that, and this ticket shouldn't either without checking. It is a real, cheap-to-close gap
against every incumbent in a sampled SERP, worth doing regardless of whether it's *the* reason for the
current position.

**Acceptance.**

- Decide once, for the whole `content-pages` collection (not per page): a visible "Last updated <date>"
  line, sourced from the same git-derived mechanism `lastmodFor()` already uses (do not hand-maintain a
  date field in the YAML - that drifts the moment someone edits copy without remembering to bump it).
  Consider whether the eight content pages should share the sitemap module's `gitFileLastModifiedIso()`
  directly or need it factored out into something both files import; don't duplicate the git-log logic.
- No author byline unless there's a real one to attach - a fabricated author name would be worse than
  no date at all, in the same spirit as CLAUDE.md's "no `AggregateRating`" rule for fabricated reviews.
  If this only ships the date, say so and close rather than inventing a byline to match competitors.
- Verify the date renders correctly across a rebuild (it should change only when the backing YAML or
  `[contentPage].astro` actually changes, matching what the sitemap already reports) and doesn't
  introduce a CLS regression on the content-page template.
- `npm run build && npm run test:seo` pass.
- Record in `docs/seo-competitive-findings.md` section 2 whether this shipped and, at the next refresh,
  whether the guide cluster's positions moved - but don't treat a move as proof; too much else is
  changing on this domain at once (SEO-01's indexing requests, SEO-06/28's crawl work) to attribute a
  shift to one field.

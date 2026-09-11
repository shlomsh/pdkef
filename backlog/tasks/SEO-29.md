---
id: "SEO-29"
title: "Every ranking how-to competitor shows a visible date or byline; our content pages show neither"
status: "done"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-08"]
legacy_state: "Done 2026-09-11"
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

## Implementation (2026-09-11)

**Shipped: the date, on all eleven content pages, English and every localized edition. No byline.**

- **One mechanism, three readers.** The git-log logic left `src/pages/sitemap.xml.js` for
  `src/lib/gitLastModified.js` (`gitFileLastModifiedIso`, `lastModifiedFor`, and
  `documentationSourceFiles(pageId, locale)`, which owns the file list a page is dated by). The sitemap's
  `<lastmod>`, the header line on the HTML page, and the `Last updated:` line in the page's Markdown twin
  (`[slug].md.ts`, the `Accept: text/markdown` representation agents read) all call the same function on
  the same file list, so they cannot disagree. Verified against `dist/` after a production build: each
  page's `<time datetime>` equals the calendar date of its sitemap `<lastmod>` and of its `.md` line.
- **Where it renders.** `ContentPageLayout.astro`'s header, under the subhead: a small muted
  `<p>` with `{messages.lastUpdated} <time datetime="YYYY-MM-DD">September 11, 2026</time>`. The label
  is a shell message (`lastUpdated`, English plus Hebrew `עודכן לאחרונה`), so a locale cannot publish
  without it (`assertDocumentationShellMessages` already enforces the catalogue). The reader-facing
  string is formatted with `Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' })` at build
  time - UTC so the same commit renders the same text on any machine; a Hebrew preview build renders
  `11 בספטמבר 2026` from the same value.
- **What a localized edition is dated by.** Its own translation YAML, which is the reviewed copy the
  reader is looking at - the same rule the sitemap already applied. English pages are dated by their
  YAML plus `[contentPage].astro`, also unchanged from the sitemap's rule.
- **No byline, deliberately.** `SeoSchema.astro` already names a real `Person` author on every page
  (Shlomi Shemesh), so one *could* be rendered without fabricating anything, and CLAUDE.md's "founder
  voice is an asset" rule would not object. It is not shipped here because putting a name visibly on
  eight guide pages is a positioning decision on that name, not a template fix; if wanted, it is a
  one-line addition next to the date, reading the same author object the schema uses.
- **CLS.** The line is server-rendered static text with no late-arriving dependency (no JS, no image,
  no font the header does not already load), so it cannot shift anything after first paint. Checked
  rendered in a browser against the built `dist/` page; nothing else in the header moved.
- **Guardrails.** `npm run build`, `test:seo` (30 pages), `test:css`, `test:weight`, `test:csp`, and the
  full unit suite (2,209 tests, including new `gitLastModified.test.js` against real repo history and a
  Markdown-line case in `markdownRender.test.js`) all green.

**One consequence to know when reading the 2026-10-08 refresh.** Because English pages are dated by
the shared template as well as their YAML, the commit that ships this line bumps all eleven pages to the
same date at once - honestly, since every one of them visibly changed, but it means the date will not
discriminate between pages until the next per-page copy edit. Do not read "all guides updated on the
same day" in that refresh as a signal about the guides.

---
id: "SEO-01"
title: "An indexing baseline, and the two mechanical reasons pages are not being crawled"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# SEO-01 · An indexing baseline, and the two mechanical reasons pages are not being crawled

## Scope and acceptance

**Nine URLs have never been indexed, and every later ticket in this epic is guessing until we know
whether that is changing.** The nine, as of 2026-09-10:

`/blur-vs-blackout-vs-delete-pdf/`, `/edit-pdf/`, `/image-to-pdf/`, `/install-pdf-app/`,
`/offline-pdf-form-filler/`, `/open-source-pdf-editor/`, `/pdf-to-image/`,
`/permanently-delete-text-from-pdf/`, `/sign-pdf-no-signup/`.

They sit in Search Console as *Discovered - currently not indexed*, which on a domain launched around
2026-06 is a crawl-budget and trust signal rather than a content-quality verdict. Note what the list
contains: three working tools that therefore earn nothing at all, and the topical support page for
`/blur-vs-blackout-vs-delete-pdf/`, which backs the one cluster the site is actually winning.

Two mechanical defects are worth fixing in the same pass, because both are cheap and both make a
crawler's job harder than it needs to be.

**The sitemap has no `lastmod`.** `src/pages/sitemap.xml.js` emits `loc`, `changefreq` and `priority`
only. Google has said for years it largely ignores `changefreq` and `priority` and does use `lastmod`
when it is accurate, so today's sitemap carries two fields that are ignored and omits the one that is
not. Add `lastmod`, derived from something that cannot drift - the git commit date of the file backing
each URL, or the build timestamp for pages with no single backing file - and state in a comment which
one it is, because an inaccurate `lastmod` is worse than none.

**`/licenses` is drawing impressions without its trailing slash** (16 impressions at position 12.88),
which means something links or links to the non-canonical form and every one of those crawls is
spending a redirect hop. CLAUDE.md's URL canonicalization section already documents how this goes
wrong. Find the source (`grep -rho 'href="/[a-z0-9-]\+"' dist/ --include='*.html'` after a build should
return nothing) and fix it.

**Acceptance.**

- A dated baseline is recorded in this ticket and in section 1 of
  [docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md): for each of the 22 site
  URLs, its Search Console coverage state, last crawl date, impressions and average position.
- `/sitemap.xml` carries a `lastmod` for every URL; the derivation is documented in the file; a build
  produces a valid sitemap (schema-valid XML, dates in W3C format) and the existing SEO checks pass.
- The build emits zero non-slash internal links, verified with the grep above.
- All nine URLs have been submitted through Search Console's URL Inspection, with the submission date
  recorded here so the follow-up measurement has a clock to run against.
- A re-measurement date is set (four weeks out) and written into the running plan in the findings doc.
  This ticket is not done until that date is on the board; the Week 4 gate depends on it.

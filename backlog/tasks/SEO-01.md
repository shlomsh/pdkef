---
id: "SEO-01"
title: "An indexing baseline, and the two mechanical reasons pages are not being crawled"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-09-10"
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

## Progress (2026-09-10)

**Done, code-verifiable:**

- `src/pages/sitemap.xml.js` now emits `<lastmod>` for every URL, derived from `git log -1 --format=%cI`
  against the file(s) that back each URL's content (documented in a comment in the file itself): the
  page's own `src/pages/<slug>.astro` plus `src/data/tools.js` for tool pages (every tool's copy lives
  in that shared registry, so this is a deliberate upper bound rather than a per-tool file - noted
  inline), the matching YAML under `src/content/content-pages/` plus the shared
  `src/pages/[contentPage].astro` for the eight landing/guide pages, and the matching YAML under
  `src/content/localized-pages/<locale>/` for published translations. Falls back to one shared build
  timestamp if git history isn't available, rather than omitting the field or lying with a stale date.
  Verified against a real build: `dist/sitemap.xml` carries a valid W3C-format `lastmod` per URL, and
  `npm run test:seo` still passes (23 pages).
- `grep -rho 'href="/[a-z0-9-]\+"' dist/ --include='*.html'` after a full build returns **nothing** - no
  internal link in the current codebase omits the trailing slash. I could not find any internal source
  for the 16 non-slash `/licenses` impressions either (Footer.astro, index.astro's two links, and every
  other internal reference already carry `/licenses/`). Read as GSC showing a residual/stale entry from
  before `vercel.json`'s `trailingSlash: true` took effect, or an external backlink out of our control,
  not a bug in this repo to fix. If the non-slash impressions are still appearing at the next refresh,
  that would be the signal to look for an external backlink instead.

**Indexing baseline (2026-09-10, from Shlomi's Search Console exports - Coverage, Coverage Drilldown,
and Performance):**

Site-wide indexing state, from the Page indexing report's issue breakdown:

| State | Source | Validation | Pages |
| --- | --- | --- | --- |
| Indexed | - | - | 11 |
| Discovered - currently not indexed | Google systems | Started | 9 |
| Page with redirect | Website | Failed | 4 |
| Excluded by 'noindex' tag | Website | Started | 2 |
| Crawled - currently not indexed | Google systems | Started | 1 |
| Alternate page with proper canonical tag | Website | Passed | 0 |

27 pages tracked in total, five more than the 22 URLs this epic counts as the live site (`/`, 9 tools, 8
content pages, 4 OS guides minus overlap, `/licenses/`) - the gap is almost certainly the 4 "Page with
redirect" entries (old slugs like the dropped `/pdf-fill-and-sign-app/` redirect, `/protect/` → `/unlock/`,
prior retargets noted in CLAUDE.md's commit history) plus the 2 noindex-excluded pages (most likely
Hebrew draft translations under `src/content/localized-pages/he/`, which are deliberately `status:
draft` and excluded from the sitemap but can still be discovered by a crawl). Neither is identified by
exact URL in the exports pulled - the Page indexing report needs one more per-category drilldown click
each to get there, the same way the nine were pulled below. Not chased further this round since neither
affects an indexed, ranking, or content-earning page; flagged here for whoever picks up the next refresh.
**The "Crawled - currently not indexed" single page is new information** - one page beyond the nine
tracked "Discovered" URLs that Google has actually crawled but still declined to index. Also unidentified
by URL; worth a drilldown next time, since "crawled but rejected" is a different, more informative signal
than "not yet crawled."

**The nine "Discovered - currently not indexed" URLs, from the drilldown Shlomi pulled:**

`/blur-vs-blackout-vs-delete-pdf/`, `/edit-pdf/`, `/image-to-pdf/`, `/install-pdf-app/`,
`/offline-pdf-form-filler/`, `/open-source-pdf-editor/`, `/pdf-to-image/`,
`/permanently-delete-text-from-pdf/`, `/sign-pdf-no-signup/` - an exact match to the list this ticket
opened with. **Last crawled is blank for every one of the nine**, meaning Google has not yet crawled any
of them even once, despite the URL Inspection submissions Shlomi made (submitted on or before
2026-09-10, the date recorded here since that's when this was confirmed). That's expected: submission
requests a crawl, it doesn't guarantee one happens immediately. The drilldown's own trend chart shows
this cohort was **4 pages from mid-July through 2026-08-28, then jumped to 9 on 2026-08-29** - a five-
page jump that lines up with Unlock, Image to PDF, Edit Pages and the two new content pages landing
around then (CLAUDE.md's "Implementation status" table). Read together with the site-wide chart (11
indexed pages, flat since 2026-08-18, while not-indexed climbed from 8 to 16 over the same window): the
newer pages have had zero of their number promoted to indexed yet, which is the crawl-budget/trust
framing this ticket opened with, not a content problem - consistent with a domain launched ~2026-06.

**Performance data (impressions/position per page, per query, by country/device) pulled fresh today
reconfirms every number already recorded in section 1 of the findings doc exactly** (e.g. `/redact/` 45
clicks/1,284 impressions/13.62 position, "blur text in pdf" 32 impressions/11.44 position, India 36/813/
12.66) - nothing drifted since that doc was written, both dated the same day. No changes needed there.

**Acceptance check:** sitemap `lastmod` ✅, zero non-slash internal links ✅, nine URLs submitted with a
recorded date ✅ (2026-09-10), re-measurement date on the board ✅ (2026-10-08, set in SEO-04/SEO-05 and
mirrored into the findings doc's Week 1 plan). The one gap against a literal reading of "for each of the
22 site URLs" is that the redirect/noindex/crawled-not-indexed categories aren't broken out by individual
URL yet (see above) - not gating, since it doesn't change any decision this epic is currently making, but
worth closing on the next refresh. **Marking this ticket done** on that basis.

## Addendum (2026-09-11): an indexed page can be stale enough to hide shipped work

The baseline above counts `/redact/` among the 11 **indexed** pages and stops there. SEO-04 captured the
rendered Google SERP the next day and found something this ticket's categories do not surface: the
indexed *content* for `/redact/` is an exact match for `src/data/tools.js` at `b4ffd96~1`, i.e. **from
before 2026-08-29**. Google is serving a title and description we replaced two weeks ago, so DEMO-07's
title work and SEO-04's meta rewrite are both invisible in the SERP while the live URL serves them
correctly (verified by `curl`).

Two consequences for this epic's measurement discipline:

- **"Indexed" is not "current".** The Coverage report's category tells us Google has the URL, not that it
  has this week's version of it. Any ticket whose acceptance is a copy change plus a CTR reading needs to
  confirm the *indexed snippet* changed before treating a flat CTR as a verdict. SEO-04's plan has been
  corrected on that basis; SEO-05's 2026-10-08 reading has the same exposure and should be checked the
  same way.
- **The nine never-crawled URLs are not the whole crawl problem.** A ranking page going 13+ days without
  a recrawl is the same crawl-budget signal in a different costume, and it is the one that directly
  blocks work we have already shipped.

**Follow-up for the next Search Console session:** request indexing for `/redact/` specifically, and
capture `Last crawled` from URL Inspection for the 11 indexed URLs, not just the nine Discovered ones.
That column is what would have caught this without a manual SERP check.

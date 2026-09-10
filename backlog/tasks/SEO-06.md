---
id: "SEO-06"
title: "Nine URLs have never been crawled, and three of them are working tools"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-01"]
legacy_state: "Open"
---

# SEO-06 · Nine URLs have never been crawled, and three of them are working tools

## Scope and acceptance

**`/edit-pdf/`, `/image-to-pdf/` and `/pdf-to-image/` returned zero impressions in three months.** Not
poor positions - absent. So did `/blur-vs-blackout-vs-delete-pdf/`, `/install-pdf-app/`,
`/offline-pdf-form-filler/`, `/open-source-pdf-editor/`, `/permanently-delete-text-from-pdf/` and
`/sign-pdf-no-signup/`. That is nine of 22 URLs earning nothing, including the topical support page for
the one cluster the site wins, and the tool that answers `jpg to pdf` - a query with millions of
searches a month that we do not appear for at all.

SEO-01 covers the mechanical half (sitemap `lastmod`, indexing requests, the `/licenses` redirect hop).
This ticket covers the half that is about the pages themselves: **give a crawler a reason to spend
budget on them.** Two things to work through, in order.

**Distinctiveness.** All nine render from shared templates - the tool pages from
`ToolPageLayout.astro` plus `src/data/tools.js`, the content pages from `[contentPage].astro`. That is
the right architecture and it is not the problem in itself, but it does mean two pages can differ by
less unique content than a crawler needs to justify indexing both. `/image-to-pdf/` and
`/pdf-to-image/` are the acute case: adjacent names, inverse operations, and a lot of shared framing.
Measure it before theorising - extract the visible text of each of the nine from `dist/` and compute how
much of it is unique to that page. Then raise the unique share where it is low, with content that is
worth reading rather than padding.

**Internal links from the pages that have authority.** `/redact/` (1,284 impressions) and `/compress/`
(326) are the only two pages Google is spending real attention on. Everything else is linked chiefly
from the home page grid, which is one hop from nowhere in particular. `ToolCrossLinks.astro` and
`RelatedGuides.astro` already exist; the question is whether the nine are reachable, prominently and
with descriptive anchor text, from those two pages specifically. Route link equity from where it has
accumulated to where it has not, rather than adding links uniformly.

**One thing not to do.** Do not delete or consolidate any of the nine to "focus" the site. They are
legitimate distinct pages; they have not been judged and found thin, they have not been looked at.

**Acceptance.**

- Unique-visible-text share measured per page for all nine, recorded here as a before-and-after table.
- Each of the nine is reachable from `/redact/` or `/compress/` within one hop, with descriptive anchor
  text, without those two pages becoming link lists - state how the addition sits in the existing design.
- `/image-to-pdf/` and `/pdf-to-image/` each carry a clearly different lead section, and it is obvious
  within the first screen which tool a visitor has landed on.
- `npm run test:seo`, `npm run test:css`, `npm run test:weight` and a `build && preview` pass all green.
- Coverage state for all nine re-checked four weeks after SEO-01's submission date and recorded in the
  findings doc. **This measurement is the Week 4 gate for the whole epic:** if none of the nine has been
  crawled, new-URL work stops and the effort moves to SEO-03.

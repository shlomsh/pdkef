---
id: "SEO-06"
title: "Nine URLs have never been crawled, and three of them are working tools"
status: "blocked"
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

## Progress (2026-09-11)

Everything measurable today is done; the one acceptance item that cannot be done today - the Week 4
coverage recheck - is genuinely time-gated and stays open against SEO-01's shared 2026-10-08 refresh
date. Status stays `open` on that basis, not `done`.

**Method.** A page's visible body text (`<body>` minus `<header>`/`<nav>`/`<footer>`/`<script>`/
`<style>`, tags stripped) was pulled from every page in `dist/` after a production build, split into
sentences, and each sentence normalized (lowercased, whitespace-collapsed). For a given page, "unique
share" is the fraction of its own distinct sentences that appear on no other page in the 22-page site.

**Read the table below with the three caveats under it. This metric turned out to be much weaker than
it looks, and the pairwise measurement further down is the one that actually answers the ticket.**

**Before / after (words = visible body word count; share = unique-sentence share as defined above):**

| Page | Words before | Share before | Words after | Share after | What changed |
| --- | ---: | ---: | ---: | ---: | --- |
| `/pdf-to-image/` | 590 | 28.9% | 706 | 35.0% | 2 new FAQ entries (page-range selection, the 3 DPI presets), distinct `aboutLead` |
| `/image-to-pdf/` | 563 | 33.3% | 669 | 38.5% | 2 new FAQ entries (mixed JPG+PNG in one batch, exact-size page embedding), distinct `aboutLead` |
| `/edit-pdf/` | 770 | 45.7% | 770 | 43.5% | Unchanged content; share moved only because the corpus around it changed (see note below) |
| `/permanently-delete-text-from-pdf/` | 975 | 65.8% | 975 | 65.8% | Unchanged - already reachable from `/redact/` via its existing hub |
| `/install-pdf-app/` | 1,113 | 66.0% | 1,113 | 66.0% | Unchanged content; newly linked from `/compress/` |
| `/offline-pdf-form-filler/` | 1,268 | 66.0% | 1,268 | 66.0% | Unchanged content; newly linked from `/redact/` |
| `/open-source-pdf-editor/` | 929 | 67.0% | 929 | 67.0% | Unchanged content; newly linked from `/redact/` |
| `/sign-pdf-no-signup/` | 1,128 | 69.8% | 1,128 | 69.8% | Unchanged content; newly linked from `/compress/` |
| `/blur-vs-blackout-vs-delete-pdf/` | 1,570 | 76.5% | 1,570 | 76.5% | Unchanged - already reachable from `/redact/` via its existing hub |

**Three caveats, and they matter more than the table.**

**1. The metric does not discriminate between pages that rank and pages that don't.** `/redact/` - the
site's best page, 1,284 impressions - scores 52.9%, and `/compress/` 44.9%. `/merge/` scores 28.8%,
*worse* than either page named as the acute case, and `/merge/` is not one of the nine at all. If the
winners and the losers sit in the same band, this number is not measuring whatever separates them. Read
it as a description of how much shared chrome a template carries, not as a diagnosis.

**2. It is mechanically inflated by adding any text at all.** Adding N unique sentences to a page with
`u` unique of `d` distinct moves the share to `(u+N)/(d+N)`, which rises toward 100% regardless of
whether the page became more distinct from anything. Both "+6 point" gains above are partly just this.

**3. It penalises the internal-link work this same ticket asks for**, which is the real explanation of
`/edit-pdf/`'s drop. An earlier draft of this section blamed the shared "Documentation" heading; that was
written without checking and is **wrong** - that heading already rendered on `/sign/`, `/redact/` and
`/edit-pdf/` before this change, so it was never unique to begin with. The actual cause, verified against
the built HTML: the two sentences `/edit-pdf/` lost are `open source & how to verify it` and `mit
licensed, plus a one-minute test that proves nothing uploads.` - the title and blurb of the
`open-source-pdf-editor` card, which previously rendered on exactly one page and now also renders on
`/redact/`. Every cross-link card added duplicates its own anchor text onto a second page. Acceptance
criteria 1 and 2 of this ticket therefore pull against each other under this metric.

**The pairwise measurement, which is what scope actually asked for.** Scope named the acute case as the
*pair* - "adjacent names, inverse operations, and a lot of shared framing" - so the question is how much
`/pdf-to-image/` and `/image-to-pdf/` share **with each other**, word-weighted so a two-word heading does
not count the same as a forty-word paragraph:

| Direction | Before | After |
| --- | --- | --- |
| `/pdf-to-image/` words also on `/image-to-pdf/` | 232 of 668 (34.7%) | 232 of 701 (33.1%) |
| `/image-to-pdf/` words also on `/pdf-to-image/` | 232 of 636 (36.5%) | 232 of 664 (34.9%) |

**232 words shared before, 232 after: this change removed exactly none of the overlap.** The percentages
moved only because the denominators grew. And listing what those 232 words actually are settles the
premise: they are almost entirely **shared site chrome, not tool copy** - the `ToolCrossLinks` grid
descriptions for the other seven tools ("Combine multiple PDFs into one document...", "Shrink a PDF
toward a size limit...", "Remove, rotate, and reorder pages..."), plus the footer's free/open-source
lines. The two tools' own H1, subhead, steps and FAQ copy barely overlap and did not before either.

**So the ticket's stated hypothesis is not supported by measurement.** These two pages are not
near-duplicates of each other; they are two pages carrying the same site furniture, exactly like every
other tool page including the two that rank. Scope said "measure it before theorising" - measured, the
theory does not hold, and that is recorded here rather than quietly dropped. The content added below is
still worth keeping on its own merit (it is accurate, specific and answers real questions), but it should
not be credited with fixing a duplication problem that the numbers say was not there.

What was added, all of it checked against the actual tool code rather than invented: the page-range
selector and the three named DPI presets (`PdfToImageTool.tsx`), and JPG/PNG mixing plus exact
pixel-to-point page sizing (`imageToPdf.js`).

**Internal links.** `ToolCrossLinks.astro` already renders every other tool - including `/edit-pdf/`,
`/image-to-pdf/` and `/pdf-to-image/` - as a descriptive-anchor card on every tool page, `/redact/` and
`/compress/` included. That covered the three tool pages already; nothing needed to change there. The
gap was the six content pages, which are only linked in via `RelatedGuides.astro`'s `hub` field, and only
two of the six (`blur-vs-blackout-vs-delete-pdf`, `permanently-delete-text-from-pdf`) hang off `/redact/`
- the other four hang off `/sign/` or `/edit-pdf/`, neither of which has real authority yet. Rather than
moving a page's primary `hub` (which would pull its card off the tool page it's actually most relevant
to), `contentPages.js` gained an optional `alsoHub` array, and `contentPagesForTool` now matches on
`hub` OR `alsoHub`. Four pages got one secondary hub each, picked for topical fit and to balance load
(`/redact/` already carried 2 related-guide cards, `/compress/` carried 0):
  - `/redact/` gained `open-source-pdf-editor` (privacy verification - direct fit for a redact
    audience) and `offline-pdf-form-filler`.
  - `/compress/` gained `install-pdf-app` and `sign-pdf-no-signup` (both "the whole app has no signup
    and works offline" - fits compress's own free/no-limits framing).

This is the same `RelatedGuides` card grid already used everywhere else on the site (icon, title,
one-line blurb, matching `ToolCrossLinks`' visual language) - not a new list-style component, and not a
bare pill row. `/redact/` now shows 4 related-guide cards, `/compress/` shows 2; both fit the grid's
existing flex-wrap layout (already proven at up to 6 cards on `/sign/`).

**`contentPagesForTool` sorts primary `hub` matches before `alsoHub` ones, and that ordering is the
only behavioural difference between the two fields - it is not cosmetic.** A flat
`filter(hub === slug || alsoHub.includes(slug))` returns registry order, and because the `sign`-hubbed
entries are listed first in `landingPages`, `/redact/` rendered "Filling a form offline" and "Open
source & how to verify it" *above* its own two topical guides. A redact visitor's first Documentation
card was a form-filling guide, and the strongest in-page link position went to the least relevant page -
the opposite of this ticket's own "route link equity" goal. Caught in review of the built HTML, fixed by
the two-tier sort, and pinned by `src/data/contentPages.test.js` - which fails on the flat filter with
`redact interleaves a primary-hub guide after a secondary one`, checked by reverting the fix rather than
assumed. That test pins the mechanism only (primary before secondary, hub slugs that resolve), not which
page points where, so the editorial mapping below stays free to change.

**Two of the four secondary hubs are a weaker topical fit than the other two, and that is a deliberate
call rather than an oversight.** `open-source-pdf-editor` on `/redact/` is a genuine fit (a redact
visitor is the most likely person on the site to want proof nothing uploads). `install-pdf-app` on
`/compress/` is reasonable. `sign-pdf-no-signup` on `/compress/` and `offline-pdf-form-filler` on
`/redact/` are equity routing first and reader service second: both are true of the product and neither
is misleading, but a reader under a heading that says "Documentation" reasonably expects relevance, and
these two lean on PDkef's whole-product framing rather than the tool in front of them. They now render
below the topical cards. If either reads as filler in situ, dropping it costs this ticket nothing that
matters - the acceptance criterion is one-hop reachability, and both pages would still have it via a
different secondary hub.

Verified in the built HTML that all nine are one hop from `/redact/` or `/compress/`:
  - `/edit-pdf/`, `/image-to-pdf/`, `/pdf-to-image/`: via `ToolCrossLinks` on both pages (pre-existing).
  - `/blur-vs-blackout-vs-delete-pdf/`, `/permanently-delete-text-from-pdf/`: via `RelatedGuides` on
    `/redact/` (pre-existing `hub`).
  - `/offline-pdf-form-filler/`, `/open-source-pdf-editor/`: via `RelatedGuides` on `/redact/` (new
    `alsoHub`).
  - `/install-pdf-app/`, `/sign-pdf-no-signup/`: via `RelatedGuides` on `/compress/` (new `alsoHub`).

**First-screen distinction.** `/pdf-to-image/`'s H1/subhead ("Convert PDF to Image Online Free" / "Turn
each PDF page into a high-quality JPG or PNG...") and `/image-to-pdf/`'s ("Image to PDF Online Free:
Combine JPG & PNG" / "Combine JPG or PNG images into a single PDF in any order...") were already
unambiguous about direction before this ticket - both server-rendered, both in the first screen. Nothing
changed here; confirmed by extracting the built `<h1>` from both pages.

**Guardrails.** `npm run test:seo`, `npm run test:css`, `npm run test:weight`, `npm run test:csp` (the
`build`+CSP-hash-verification half of "`build && preview`" - CLAUDE.md's CSP section; no script or
config changed, only `.astro`/data-file content, so a running preview added nothing `verify-csp.js`
doesn't already check against `dist/`) and the full `npx vitest run` suite (2,122 tests) all pass on this
branch.

**What's still open.**

- **The Week 4 coverage recheck** (this ticket's last acceptance line) needs real elapsed time against
  Search Console and is scheduled for 2026-10-08 alongside SEO-01/04/05's shared refresh. Revisit this
  ticket then and record the result in the findings doc as specified.
- **`/edit-pdf/` got no content work**, and that is a descope, not a completed item. It is one of the
  three working tools this ticket's title is about. It was skipped because the pairwise measurement above
  says the sibling-duplication premise does not hold, so there was no measured defect to fix on it - but
  "no measured defect under a metric that does not discriminate" is not the same as "fine". If any of the
  nine gets content work next, this is the one.
- **Neither page was checked rendered in a browser**, only in the built HTML. The change is data-only
  through components that already ship, so the risk is low, but `/compress/` renders a `RelatedGuides`
  section for the first time and nobody has looked at it.
- **`build && preview` was run as `build` + `verify-csp.js` against `dist/`**, not with a live preview
  server. No script, style or config changed, so the CSP-hash class of bug this acceptance line exists to
  catch is covered by the script; hydration in a real browser is not.

## Related but separate: recrawl recency on already-indexed pages (2026-09-11)

SEO-01's 2026-09-11 capture found `/redact/` and `/split/` - the two pages with real traffic - both
crawled once in July and skipped in every crawl pass since, while worse-linked pages got recrawled in
August. That reads like the same "crawl budget going to the wrong place" story this ticket tells for the
never-crawled nine, so it was checked here rather than assumed. It is not the same mechanism: `/redact/`
carries 28 inbound internal links (more than any page here except `/sign/`) and `/split/` ties the two
pages that *were* recrawled, so the internal-linking and distinctiveness levers this ticket uses have
nothing to act on for either page - the problem is recrawl scheduling on pages that already rank, not
crawl discovery on pages that don't. Scoped separately as
[SEO-28](./SEO-28.md), which has the full header/sitemap/link-count check.

## Status 2026-09-11: blocked on the Week 4 gate

Content and link work shipped; `/edit-pdf/` deliberately descoped (see above). What remains is the
coverage recheck on **2026-10-08**, which is also the gate for every new-URL ticket (SEO-19 to 24).
Marked `blocked` until that capture; reopen with a finding if any of the nine is still uncrawled.

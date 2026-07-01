# SEO Action Plan — pdkef.vercel.app

## Critical (fix immediately — blocks indexing/discovery)

None. The critical issues from the 2026-06-30 audit (placeholder domain, missing OG image, missing Apple touch icon) are all resolved.

## Resolved

1. ~~Add `/protect/` to the homepage tool grid~~ — **not applicable.** `/protect/` was intentionally merged into the "Protect & Unlock" card (which links to `/unlock/`); the standalone `/protect/` route/page is leftover from before the merge, not a missed link. This needs cleanup (likely remove the page and its sitemap entry, or redirect `/protect/` → `/unlock/`) rather than a new link — flagged separately below, not fixed yet.

2. ~~Trim two over-length titles~~ — **done.**
   - `/compress/`: "Compress PDF to 100KB Free - Reduce PDF File Size Online | PDkef" (64 chars) → "Compress PDF to 100KB Free - Reduce File Size | PDkef" (53 chars)
   - `/edit-pdf/`: "Edit PDF Online Free - Rotate, Reorder & Remove Pages | PDkef" (61 chars) → "Edit PDF Online Free - Rotate, Reorder, Remove Pages | PDkef" (60 chars) — kept "Reorder" since it names a real, distinct feature (drag-and-drop page reordering), not filler; the original was only 1 char over the 60-char guideline, so swapping "&" for "," to save a character was enough, no need to cut a feature.
   - Both keep the primary keyword phrase and "Online" (consistent with the title convention on every other tool page) intact per `CLAUDE.md`'s SEO invariants.

## High (fix within 1 week — significant discovery/ranking impact)

1. **Add tool-to-tool cross-links on each tool page** *(postponed by user request — pick up tomorrow, 2026-07-02)*
   - Files: the 9 tool `.astro` pages (`src/pages/merge.astro`, `split.astro`, etc.)
   - Currently each tool page links only to `/` and `/licenses`. Add a small "Related tools" or "Other tools" link section (could live in `Footer.astro` if it should appear on every page, or per-page if you want curated related-tool pairings e.g. Merge↔Split↔Compress).
   - This is the largest remaining on-page SEO gap — internal links are a strong on-page ranking signal and currently the site's link graph is one level deep from the homepage only.
   - Effort: 30-45 minutes (design a small shared component + wire into each page, or extend `Footer.astro`).

2. **Decide what to do with the leftover `/protect/` page**
   - `/protect/` still exists as a standalone route, is in `public/sitemap.xml`, and is fully indexable (200, valid schema, no noindex) — but it was superseded when Protect was merged into the "Protect & Unlock" card on `/unlock/`. Right now it's a duplicate-intent orphan page competing with `/unlock/` for the same search intent with no internal link support.
   - Needs a decision: remove the page (and its sitemap entry) if `/unlock/` fully covers the "add a password" flow, or keep it as a distinct SEO-targeted page (different keyword: "protect PDF" vs "unlock PDF") and link to it deliberately instead of treating it as dead weight.
   - Effort: 5 minutes to decide, 10-20 minutes to implement either path.

## Medium (fix within 1 month — optimization opportunities)

3. **Consider generating the sitemap dynamically**
   - `public/sitemap.xml` is accurate today (all 10 routes present) but hand-maintained, per `CLAUDE.md`'s own documented caveat. Now that the site has grown to a 10-page multi-tool hub, adding `@astrojs/sitemap` removes the risk of it silently drifting out of sync the next time a tool page is added.
   - Effort: 15-20 minutes integration + verify build output.

## Low (backlog / nice to have)

5. **Verify Lighthouse Performance + SEO ≥ 95 against the live deployment**
   - `CLAUDE.md` states this as a target but no recent lab/field measurement is on record. Run PageSpeed Insights against `https://pdkef.vercel.app/` (and ideally one tool page) once the linking changes above ship.
   - Effort: 5-10 minutes to run, plus whatever follow-up the score reveals.

---

## Summary

| Priority | Count | Estimated total effort |
|---|---|---|
| Critical | 0 | — |
| High | 2 | ~45-60 minutes |
| Medium | 2 | ~25-30 minutes |
| Low | 1 | ~10 minutes |

The two High items are both internal-linking fixes and are the highest-leverage remaining work — they close the one genuine orphan page (`/protect/`) and turn the site's flat hub-and-spoke structure into a properly cross-linked cluster, which should help both crawl efficiency and user tool-discovery (a visitor solving one PDF problem is a good candidate to also need a related one).

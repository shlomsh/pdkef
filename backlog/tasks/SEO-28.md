---
id: "SEO-28"
title: "Redact and Split earn the most and are recrawled the least, and nothing we control explains it"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-01"]
legacy_state: "Open"
---

# SEO-28 · Redact and Split earn the most and are recrawled the least, and nothing we control explains it

## Scope and acceptance

**This ticket exists because of a question, and the answer to the question is what it scopes.** SEO-01's
2026-09-11 capture found `/redact/` (64% of all clicks) last crawled 2026-07-07 and `/split/` last
crawled 2026-07-05 - both over two months stale - while Googlebot visited eight other URLs (`/`, `/sign/`,
`/merge/`, `/unlock/`, the four OS guides) between 2026-08-18 and 2026-08-30 and skipped these two every
time. The question: is that the same problem SEO-06 solves (give a crawler a reason to spend budget
here), or a different one? SEO-06's own mechanisms - distinctiveness, internal link routing - assume the
crawler is choosing based on signals a page carries. This ticket checked whether that assumption holds
for `/redact/` and `/split/` specifically, before writing more of either kind of fix.

**It does not hold. Every signal checked points the same direction: not worse, if anything better.**

- **Response headers are identical across every page, stale or not.** `curl -sI` against `/redact/`,
  `/sign/`, `/split/`, `/merge/`, `/unlock/`, `/compress/` and `/how-to-sign-a-pdf-on-mac/` all return the
  same `Cache-Control: public, max-age=0, must-revalidate`, and `Last-Modified` is stamped to the request
  time itself (identical to the `Date` header), not to any real content-change date - Vercel does not
  expose a content-derived `Last-Modified` for this static build, and every page gets the same
  no-cache-hint policy. There is no header difference between the stale pair and the current pair for
  Google to act on.
- **Sitemap `lastmod` does not distinguish them either, and the reason is a known, accepted tradeoff, not
  a bug.** `src/pages/sitemap.xml.js` derives a tool page's `lastmod` from `git log` on its own `.astro`
  file **plus** the whole shared `src/data/tools.js` registry (its own comment: "editing any tool's entry
  bumps every tool page's lastmod... overstates freshness for the others but never understates it").
  SEO-06 touched `tools.js` on 2026-09-10, so the current sitemap stamps `/redact/`, `/split/`,
  `/compress/`, `/merge/`, `/unlock/` and `/sign/` with the **identical** `2026-09-10T21:54:25Z` lastmod -
  confirmed by fetching `/sitemap.xml` directly. `/merge/` and `/unlock/` share that exact timestamp and
  were crawled inside the August window; `/redact/` and `/split/` share it and were not. Whatever this
  coarseness costs the domain in trust (crying "changed" on every deploy for pages that didn't), it is
  paid by the whole tool-page group equally and cannot be the reason two specific URLs were skipped.
- **Internal link count runs the wrong way to explain it.** Counting every `href` in the built site:
  `/redact/` has **28** inbound internal links (second only to `/sign/`'s 42, and higher after SEO-06's
  own cross-link work), `/split/` has **19** - tied exactly with `/merge/` and `/unlock/`, both crawled in
  August. The four OS guides, crawled in the same August window, have only **4-5** inbound links each -
  an order of magnitude fewer than `/redact/`. If crawl frequency tracked internal link signal the way
  SEO-06 assumes, `/redact/` should be *more* likely to be revisited than the OS guides, not less. It is
  the opposite of a linking defect.

**So this is not a page-signal problem, and SEO-06's levers - the ones that worked for getting the
never-crawled nine linked and measured - have nothing to act on here.** Widening SEO-06's acceptance to
cover this would attach an unrelated, unsolved problem to a ticket whose actual mechanism cannot touch it.

**The pattern that best fits the evidence, stated as a hypothesis, not a finding:** `/redact/` and
`/split/` were indexed earliest, before the August wave. Google's own crawl-demand model schedules
recrawls partly from a URL's *observed* history of how often it changes - a URL that was quiet for a
while can get deprioritized, and a domain's newly-discovered URLs often get an initial attention boost
that a URL crawled once in July has already used up. That fits every fact on the table (the August wave
reads as first- or second-crawl attention for newly indexed URLs, not a recrawl of URLs already known)
without requiring any defect in this repo. **It is a hypothesis because nothing available here can
confirm it** - Search Console's crawl-stats and crawl-demand detail are not accessible in this
environment (see `feedback_serp_data_ask_shlomi` - Shlomi reads Search Console by hand). If it is right,
the fix is not code; it is time plus the content actually changing, which `/redact/` and `/compress/`
have now done twice in the last 48 hours.

**What is and is not an acceptable answer here.** Requesting indexing resubmits the current crawl queue
position - it does not change why the scheduler deprioritized these two, and treating "request indexing"
as this ticket's fix would just be restating SEO-01's mechanical step under a new ID. The honest scope for
this ticket is measurement and a decision point, not a code fix, because no code-shaped cause was found.

**Acceptance.**

- The header/sitemap/link-count checks above are the diagnosis; nothing here changes `src/`. A future
  agent reopening this should re-derive at least the link-count check before assuming it still holds
  (SEO-06-style content or link work in the meantime could change it).
- ~~`/split/` gets an indexing request~~ - done. This section originally flagged `/split/` as missed;
  SEO-01's 2026-09-11 update recorded all nine stale URLs requested that same day, `/split/` included.
- Re-run `npm run seo:crawl-staleness` at the next `docs/seo-last-crawled.json` capture (SEO-01/SEO-02's
  shared 2026-10-08 refresh) and record here whether `/redact/` and `/split/` have been recrawled.
  **SEO-01's 2026-09-11 update sets up the control this ticket needed and didn't have to ask for
  separately**: `/merge/` and `/unlock/` were deliberately left off the indexing-request list, so the
  same capture separates "did asking work" from "is the domain's crawl rate rising on its own" -
  exactly the two things this ticket's outcomes below need distinguished. Read them together:
  - **`/redact/`/`/split/` recrawled current, and `/merge/`/`/unlock/` also moved without being
    asked:** the domain's crawl trust is rising on its own - the "crawl-age/demand-model" hypothesis is
    supported. Close this ticket, no code fix was needed.
  - **`/redact/`/`/split/` recrawled current, but `/merge/`/`/unlock/` did not move:** the recrawl was
    bought by the indexing request, not earned by rising trust. That is a real result, but it means the
    allocation problem is still there under the surface - note it and keep watching rather than closing.
  - **Still stale, unchanged from this capture:** the hypothesis is wrong or incomplete. Escalate: check
    whether Search Console's own Crawl Stats report (page fetched, by response, by purpose - available to
    Shlomi, not to this environment) shows Googlebot deprioritizing these URLs specifically, and widen the
    investigation to `robots.txt`, canonical tag correctness, or a crawl-budget ceiling from SEO-03's
    external-signals scope rather than continuing to look for an on-page cause this round already ruled
    out.

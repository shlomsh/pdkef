---
id: "SEO-10"
title: "Read 2026-10-08 · Merge answers the no-limit question in the FAQ, where nobody reading the SERP can see it"
status: "blocked"
priority: "P2"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-10 · Read 2026-10-08 · Merge answers the no-limit question in the FAQ, where nobody reading the SERP can see it

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, read date 2026-10-08: shipped; /merge/ is the SEO-28 control, no indexing request.

## Scope and acceptance

**`/merge/`: 47 impressions, no clicks, position 36.13.** The research names
`merge pdf online free no limit` (60k-140k/mo) with supertool ranking at #3 on explicit unlimited-size
and no-file-cap claims above the fold.

We have the better version of that fact and we keep it in the FAQ. `gridDescription` says "no page limit
or watermark", `freeNoteLead` says "no watermark and no page limits", and the FAQ entry
"Is there a file size or page limit?" answers it properly. None of that is what a visitor sees first,
and the meta description does not mention limits at all.

**The register matters more than the content here.** The obvious move is trust badges, and the voice
rules rule it out: no intensifiers, no "100% unlimited", no comparison to a named competitor. The
existing house pattern is `OfflineProof.astro`, which states a fact and then shows you how to check it.
Follow that. "Combine as many files as you like; nothing is uploaded, so there is nothing to meter" is
both stronger and truer than a badge, and it is the sentence that only we can write - a server-side
competitor's cap exists for a reason and cannot simply be removed.

**One honest caveat to keep.** The real limit is the device's memory, and the FAQ says so. It stays said.
A promise of no limits that a visitor discovers is false on a 400MB file costs more than it earns.

**Acceptance.**

- The no-limit, no-watermark, no-account fact is in the server-rendered HTML above the tool on `/merge/`,
  in the `OfflineProof` register rather than as badges.
- The device-memory caveat remains present and findable.
- `seoDescription` for `/merge/` is re-examined against the merge queries in the Search Console export
  and updated if the current one omits the fact people are searching for.
- No competitor is named or alluded to anywhere in the new copy.
- `npm run test:seo`, `npm run test:css` and `npm run test:weight` pass; single `<h1>` preserved.
- Position and CTR before and after in the SEO-02 table.

*Update 2026-09-11:* The no-limit fact now renders in server-rendered HTML above the tool on `/merge/`
(one sentence, `OfflineProof` register: state it, then the device-memory caveat, no badges), and
`seoDescription` was rewritten to mention the limit people search for. `npm run test:seo`, `test:css`,
`test:weight` and the full unit suite pass. Left open: the before/after position and CTR reading in the
SEO-02 table, which needs a Search Console pull after the change is live and recrawled.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped; nothing left to build. **No indexing request, deliberately**: `/merge/` is one of the two control URLs SEO-01/SEO-28 left unrequested on 2026-09-11 (with `/unlock/`) to separate a bought recrawl from a rising crawl rate. Requesting it would buy this ticket its verdict and destroy that control, so this waits for a natural recrawl; if 2026-10-08 shows `/merge/` still on its August date, decide then whether the control has told us what it can and request it. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.

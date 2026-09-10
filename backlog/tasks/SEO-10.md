---
id: "SEO-10"
title: "Merge answers the no-limit question in the FAQ, where nobody reading the SERP can see it"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-10 · Merge answers the no-limit question in the FAQ, where nobody reading the SERP can see it

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

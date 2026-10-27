---
id: "MEM-19"
title: "The deploying commit lives outside the page HTML, so an update re-downloads only the pages that changed"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 11
depends_on: []
---

# MEM-19 · The deploying commit lives outside the page HTML, so an update re-downloads only the pages that changed

*Filed 2026-10-27* from the update-cost measurement after MEM-15..18.

## Why

- `src/layouts/BaseLayout.astro:53` emits `<meta name="pdkef-build" content="__BUILD_COMMIT__">` on
  every production page, and `scripts/buildCommit.mjs` writes the commit into it after the build id is
  hashed. Its one reader is `src/lib/errorReport.ts:153`, which attaches the commit to error reports.
- Since MEM-16 an update revalidates every non-hashed URL with `cache: 'no-cache'`, so an unchanged page
  costs a 304. The stamp makes all 54 stamped pages differ on every deploy, so every update downloads
  them all: about 1.48 MB (brotli q5) of the 1.5 to 1.8 MB a typical update costs, measured over ten
  output-changing deploys of main (median 1,577,949 bytes with the stamp, 662,129 without).
- A deploy that changes no output keeps the same `sw.js` and triggers no update, so the stamp costs
  nothing there; it costs the full HTML set on every deploy that does.

## Outcome

- No per-deploy value is written into page HTML. The commit reaches error reports from one place that
  is not part of every page (the choice of place is part of this ticket; it must keep reports
  synchronous and must not add a request the page does not already make).
- A page whose own content did not change is byte-identical across deploys.

## Acceptance

- [ ] Two builds of commits that differ only outside `src/` and `public/`, with different
      `VERCEL_GIT_COMMIT_SHA`, produce byte-identical HTML for every page.
- [ ] Error reports still carry the deploying commit (unit test on `errorReport.ts`).
- [ ] The update cost of the same deploy pairs as the 2026-10-27 measurement is re-measured and written
      in the Done section.

---
id: "MEM-19"
title: "The deploying commit lives outside the page HTML, so an update re-downloads only the pages that changed"
status: "done"
priority: "P2"
epic: "robustness"
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

- [x] Two builds of commits that differ only outside `src/` and `public/`, with different
      `VERCEL_GIT_COMMIT_SHA`, produce byte-identical HTML for every page.
- [x] Error reports still carry the deploying commit (unit test on `errorReport.ts`).
- [x] The update cost of the same deploy pairs as the 2026-10-27 measurement is re-measured and written
      in the Done section.

## Done

*2026-10-27.* The commit travels in a `Server-Timing: build;desc="<sha7>"` header that `middleware.ts`
sets on every HTML response from `VERCEL_GIT_COMMIT_SHA` at runtime (`src/site-lib/buildCommit.ts`), and
`readBuildCommit` in `src/lib/errorReport.ts` reads it off the navigation entry. The meta tag, its stamping
step and `scripts/buildCommit.mjs` are gone. `deploy:prod` passes the commit as a runtime `--env` too,
since a CLI deploy has no system variable at runtime.

- Two builds with different `VERCEL_GIT_COMMIT_SHA` produce an identical `dist/` (`diff -rq`, no output).
- Chromium and WebKit expose the header on network loads and on navigations the service worker answers
  from its Cache API (scratch harness, both browsers). `e2e/error-report-build.spec.js` checks a routed
  header reaches the report.
- Update cost on the ten deploy pairs of the 2026-10-27 measurement, brotli q5, with the stamp removed and
  CSP hashes sorted (MEM-20): median 1,577,973 to 398,025 bytes; max 1,780,993 to 1,779,496 (S6, real
  content change on 118 files). Four of ten pairs fall under 120 KB.
- Live check after the first deploy: `curl -sI https://pdkef.com/merge/` shows the `server-timing` header.

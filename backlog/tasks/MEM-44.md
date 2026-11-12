---
id: "MEM-44"
title: "A tool's late code comes as one file"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-44 · A tool's late code comes as one file

*Filed 2026-11-12*, the owner's target shape after MEM-43: each tool has a few resources of its own, tools rarely
change so a bigger re-download on an update is fine, and no tool carries another tool's code.

## Why

MEM-43 makes the worker fetch a tool's whole closure on the first visit, so every small lazy chunk is a billed CDN
request. Measured by `npm run test:request-count`: `/redact/` 57 requests and `/sign/` 53 on a first visit. About
17 of Redact's extra files were small lazy chunks (ten under 2 KB brotli), grouped by nothing because MEM-37 left
lazy modules alone so they never reach a first paint.

## What

`astro.config.mjs` groups late modules (reached by no entry statically) by the tools that reach them:
`<tool>-late` for one, `editor-late` for Sign, Redact and Highlight only, `tools-late` for other sets. Anything the
home page, `/open/`, the widgets, the island client, Drive or the site scripts also reach stays ungrouped. The
groups have no `$initial` tag, so the name function walks static importers to the entries itself and skips any
module an entry reaches; pdf.js, pdf-lib, the workers, `signals`, Preact, virtual modules and non-JS assets are
never grouped. `check-lazy-modules.js` re-keys its rows to the bundles, and checks that no `*-late.js` is in a
first paint, that `<tool>-late.js` is reachable from that tool's pages only, and a lazy-file budget per page.
Request budgets lowered to 43 and 43.

## Done when

- [ ] Guards green: `test:lazy-modules`, `test:request-count`, `test:stable-names`, `test:precache-budget`,
      `test:weight` (first-paint JS did not grow), `test:css`, `test:csp`.
- [ ] Offline specs pass for all twelve tools; time to open a file on `/sign/` and `/redact/` within 150 ms of before.
- [ ] Measured live: a first visit to `/redact/` and `/sign/` makes 43 requests or fewer, and a tool works offline.

## After review (2026-11-12)

`sign-late.js` was 790 KB raw / 279 KB brotli, of which only about 11 KB brotli is Sign's own code; the rest is
the font library (`@pdf-lib/fontkit`) and its tables. Third-party late modules that would land in `sign-late` now
go to `sign-vendor` (unhashed names, so an edit to Sign's code used to re-download all of it). Now `sign-late.js`
is 33 KB raw / 11 KB brotli and `sign-vendor.js` 756 KB raw / 268 KB brotli. `sign-late.js` imports `sign-vendor.js`
statically, so opening a file on `/sign/` fetches both; what changes is the update cost: an edit to Sign's late code
re-downloads about 11 KB instead of 279 KB. `/sign/` and `/he/sign/` gain one lazy file (first visit 43 to 44, a
deliberate rise).

### Still open

- No `saveData`/metered-connection gate on the first-visit install (about 1-1.5 MB per tool).
- The airplane line is untrue until the install completes; going offline in that window shows the misleading "may be damaged" error.
- The offline e2e covers 12 routes, not Scan, the image tools, Add Page Numbers or the `/he/` pages, and stops at the loaded state without exporting.
- `tools-late` carries Scan/Highlight-only page-straightening code to every tool.
- The home page's airplane line has no worker behind it on a first visit.

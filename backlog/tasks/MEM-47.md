---
id: "MEM-47"
title: "A tool page never fetches a stylesheet whose rules it already has"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-47 · A tool page never fetches a stylesheet whose rules it already has

*Filed 2026-11-12*, merge 1 of the four in [docs/offline-and-requests.md](../../docs/offline-and-requests.md), in the
shape the owner chose after a spike.

## Why

A tool page's CSS comes from two builds. The page build writes the `<link>` sheets (6 on /redact/), split by which
pages share each module. The browser build writes its own copies, named after its script chunks
(`tools-common-*.css`, `editor-core-*.css`, `home-tools-*.css`), and lists them as preload dependencies of the
late scripts. Vite skips a preload dependency only when a `<link rel=stylesheet>` with the exact same URL is on
the page, so these are fetched again at install although the page already has their rules (spike, 2026-11-12:
`home-tools` 100%, `editor-core` 85%, `tools-common` 66% of rules already on /redact/). About 3 requests per tool
page buy nothing.

"One sheet per tool" is not possible by build grouping: a CSS module lives in one chunk, so CSS several tools
share cannot also sit in each tool's sheet. Grouping the page build's CSS by tool pages took /redact/ from 6 sheets
to 4 for about 8 KB more and failed the duplication ratchet (0.49x against 0.46x); the owner chose not to.

## What

Make the browser build's sheets and the page's sheets agree, or stop the browser build listing CSS the page
carries, so no tool page fetches a sheet twice. Spike first; no hand-merging after the build.

## Done when

- [x] No tool page's install fetches a client sheet whose rules its linked sheets already hold, guarded (`scripts/linkClientSheets.mjs` swaps a page sheet for the client sheet that holds it whole, and fails the build on any left).
- [x] CSS ratchets unchanged or lower; request budgets lowered to the measured figures (/redact/ 33 to 31, /sign/ 35 to 32).
- [ ] Measured live.

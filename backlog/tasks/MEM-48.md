---
id: "MEM-48"
title: "Pages with an interactive part load their UI glue as one file"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-48 · Pages with an interactive part load their UI glue as one file

*Filed 2026-11-12*, merge 3 of the four in [docs/offline-and-requests.md](../../docs/offline-and-requests.md).

## Why

Every page with an island (the tool pages, `/`, `/he/`, `/open/`, `/drive/`) loads Preact, its hooks, the island
client, `islands-tools` and `home-tools` at first paint, and `signals` and `sha256` lazily; `/`, `/he/` and
/redact/ add `PinnedNotes`. Eight small files, about 25 KB brotli together, each a billed request.

## What

One client group, `ui`, holds them: `preact`, `preact-hooks`, `signals`, `islands-tools`, `home-tools`, `sha256` and the `PinnedNotes` widget. `rolldown-runtime` stays apart (every
page uses it). Article pages still load none of it (`check-lazy-modules.js` keeps guarding the UI library off
pages without an island, re-keyed to `ui.js`). Cost: `/open/` and `/drive/` carry `home-tools` (about 8 KB) and
pages without the rating board carry `PinnedNotes` (about 1 KB) they do not use. Built once against the real notes
store before landing.

## Done when

- [x] Guards re-keyed and green; request budgets lowered to the measured figures.
- [x] Unit suite, offline specs and the Chromium suite pass; a build against the real notes store renders the board.
- [ ] Measured live after landing.

## Result (build, 2026-11-12)

The island client stays its own file: folding it in needs a default export appended to `ui.js` after the build,
and the owner declined editing built output for one request. `npm run test:request-count`: `/` 19 to 15 and 8 to
5 after a file is opened, `/redact/` 40 to 33, `/sign/` 41 to 35. `ui.js` is 23 KB brotli. `/open/` carries about
8 KB of glue it does not use; its precache budget (`other`) rose from 42,000 to 44,200, owner-approved (measured
44,156 with the real notes). Article pages load none of it. Built with the real notes store: the board renders.
Unit suite, offline specs (one timing flake in `app-update.spec.js`, green on 3 reruns) and the Chromium suite pass,
apart from `card-reveal.spec.js:178`, which fails only with real notes and fails on the live site too: the
rating-board card on `/` is 47 px taller than the 1280x720 laptop band. Not this change; tracked separately.

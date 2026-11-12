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

One client group, `ui`, holds them: `preact`, `preact-hooks`, `signals`, the island client (`site/client.js`'s
code), `islands-tools`, `home-tools`, `sha256` and the `PinnedNotes` widget. `rolldown-runtime` stays apart (every
page uses it). Article pages still load none of it (`check-lazy-modules.js` keeps guarding the UI library off
pages without an island, re-keyed to `ui.js`). Cost: `/open/` and `/drive/` carry `home-tools` (about 8 KB) and
pages without the rating board carry `PinnedNotes` (about 1 KB) they do not use. Built once against the real notes
store before landing.

## Done when

- [ ] Guards re-keyed and green; request budgets lowered to the measured figures.
- [ ] Unit suite, offline specs and the Chromium suite pass; a build against the real notes store renders the board.
- [ ] Measured live after landing.

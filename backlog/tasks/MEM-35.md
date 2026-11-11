---
id: "MEM-35"
title: "The worker precaches the tools a person uses, not the whole app"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: ["MEM-34"]
---

# MEM-35 · The worker precaches the tools a person uses, not the whole app

*Filed 2026-11-11*, step 2 of [docs/request-budget.md](../../docs/request-budget.md). Decided by Shlomi on
2026-11-11: offline covers the tools a person has used (D2 in the doc).

## Why

MEM-15's whole-app install is about 250 requests per new visitor, most of whom use one tool once.

## What

Install caches the shell and the closure of each tool page open at install; a tool opened later is cached
on use, closure included; an update re-precaches the pages the previous cache held. Guides, unopened
localized pages, extra icons, `sample.pdf`, guide media, `404.html`, the verification file and codec wasm
leave the precache list. Offline copy and the MEM-15 e2e case change with it.

## Done when

- [ ] Unit tests for the install set, the on-use closure and the update carry-over; the offline e2e case
      rewritten to "a tool you opened works offline".
- [ ] Landed, MEM-33's budgets lowered.

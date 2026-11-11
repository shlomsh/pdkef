---
id: "MEM-33"
title: "A guard counts the requests a new visitor costs, page plus worker install"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-33 · A guard counts the requests a new visitor costs, page plus worker install

*Filed 2026-11-11*, step 0 of [docs/request-budget.md](../../docs/request-budget.md).

## Why

Vercel's Hobby plan counts requests, not bytes, and a new visitor cost about 300 of them on 2026-11-11.
Nothing in CI counts requests, so every later step of the plan, and every later change, could add them back
unseen.

## What

`scripts/check-request-count.mjs` reads `dist/` and the precache manifest and counts, for `/`, `/redact/`
and `/sign/`: the page's own requests on load (HTML, eager scripts and stylesheets, icons and manifest it
links) and the worker install's requests beyond those. It fails when a page exceeds its budget, like
`test:weight`. Budgets start at today's figures and only go down as the plan lands.

## Done when

- [ ] The guard runs in CI after `build`, with unit tests for the counting.
- [ ] Budgets are lowered to the measured figure after each of MEM-34..37 lands.

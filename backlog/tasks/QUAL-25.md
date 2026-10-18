---
id: "QUAL-25"
title: "Playwright jobs run in the Playwright container image, so no job installs a browser"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
---

# QUAL-25 · Playwright jobs in the Playwright container

*Filed 2026-10-18* after QUAL-23/24. With the chromium e2e shards at 150-210s, the next things on
CI's critical path are `e2e-webkit` (220s on run 39141500514) and `checks` (194s).

## Why

Every Playwright job (four `e2e` shards, `e2e-webkit`, two `font-guards` shards, `export-guards`)
restores its browser from `actions/cache` and then still runs `playwright install-deps` for the apt
libraries, which the cache cannot hold: 11-15s per chromium job and 38-39s for `e2e-webkit`
(runs 39125115748 and 39124382451). The official image
(`mcr.microsoft.com/playwright:v<the @playwright/test version>-noble`) ships the browsers and their
system libraries, so those steps and the cache go away.

## Scope

- Run the Playwright jobs in `container:` with the image tag pinned to the exact
  `@playwright/test` version in `package-lock.json`, and a guard (in `test:dependency-governance` or
  a small script) that fails when the two drift.
- Drop the browser-cache and install steps from those jobs.
- Check what the container changes: the export render baseline is platform-bound
  (`BASELINE_PLATFORM` in `e2e/sign/fixtures/exportRenderHarness.js`) and the font guards' pixel
  thresholds were tuned on the ubuntu runner; poppler-utils and git history (`fetch-depth: 0`) must
  still be there where a job needs them. A baseline that moves is recaptured by the manual dispatch,
  never edited by hand.

## Done when

- A full CI run on a branch is green with every Playwright job in the container, and the
  per-job and whole-run seconds are recorded here against the numbers above.

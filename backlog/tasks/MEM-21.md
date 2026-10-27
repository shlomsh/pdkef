---
id: "MEM-21"
title: "A nightly job measures what an update downloads against the previous deploy, with a target of about 500 KB"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: ["MEM-19", "MEM-20"]
---

# MEM-21 · A nightly job measures what an update downloads against the previous deploy, with a target of about 500 KB

*Filed 2026-10-27* from the update-cost measurement after MEM-15..18.

## Why

- A returning client's update downloads every changed `/_astro/` file (MEM-16 copies the rest) plus every
  non-hashed URL whose bytes changed. Measured over ten output-changing deploys of main: median 1.58 MB,
  max 1.78 MB (brotli q5), mostly HTML that changed only by the commit stamp (MEM-19) or CSP hash order
  (MEM-20). Without those, the median was about 0.66 MB, and a shared-chunk change reached 1.6 MB.
- `test:precache-budget` (MEM-18) budgets one build. The update cost depends on two builds, so no CI
  check sees it; it grew unnoticed until measured by hand.
- The measuring scripts exist in the session scratchpad (`update-cost/analyze.mjs`): the install set of
  each build from `scripts/precacheClosure.mjs`, then the bytes of new hashed URLs plus changed
  non-hashed URLs, plus `sw.js` and the manifest.

## Outcome

- A nightly job builds the current main and the previous deployed commit, computes the update cost
  between them with one pure function in `scripts/` (unit-tested on fixture builds), and fails above the
  target, naming the largest contributors.
- The target, about 500,000 bytes brotli, lives beside the other precache budgets with the measurement it
  came from. A deploy that changes shared chunks may exceed it; the failure says which chunks cascaded.

## Acceptance

- [ ] Unit tests: unchanged builds cost only `sw.js` and the manifest; one renamed chunk costs that chunk
      plus the pages that reference it; a page changed only in bytes, not in references, costs that page.
- [ ] The nightly run reports the cost and the top contributors in its summary.
- [ ] The target and the measurement behind it are written in the Done section.

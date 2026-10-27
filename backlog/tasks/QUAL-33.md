---
id: "QUAL-33"
title: "A stalled apt install costs at most one retry, not ten minutes"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# QUAL-33 · A stalled apt install costs at most one retry, not ten minutes

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `npx playwright install-deps chromium` runs apt on the font-guards and export-guards jobs
  (`.github/workflows/ci.yml:862`, `:939`), and the `checks` job installs poppler the same way. The
  mirror stalls often enough to dominate wall time:
  - 6 of 24 runs had one apt-bound job stall.
  - 40530978756: export-guards 774 s, a 790 s run for a one-unit-test commit.
  - 40528265497: font-guards 596 s. 40544201639: 401 s and 361 s. 40563223976: 371 s. 40549398142: 328 s.
  - `checks`/poppler showed 100 to 212 s on several runs.
- QUAL-29 moved other Playwright jobs into the Playwright container, which removes the apt step.

## Outcome

- Each apt step is bounded (for example `timeout 90` with one retry), or the job runs in the Playwright
  container like the e2e jobs. If the container route is chosen, the font thresholds and the export
  baselines are re-measured on it first, since those guards are calibrated per platform
  (docs/shaping-guard-platform-calibration.md).

## Acceptance

- [ ] No apt step can run longer than its bound plus one retry.
- [ ] Over the next 20 main runs, no job spends more than 120 s installing system packages.

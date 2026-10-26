---
id: "QUAL-29"
title: "e2e-webkit runs in Playwright's container image, so a slow Ubuntu mirror can't hold CI for 50 minutes"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-29 · e2e-webkit runs in Playwright's container image

Filed 2026-10-26 from Shlomi's "something is stuck" on CI run 40387643780.

## What happened

`e2e-webkit` ran `npx playwright install-deps chromium webkit` on every run: about 119 MB of system
libraries (gstreamer, ffmpeg codecs, fonts) from `azure.archive.ubuntu.com`. Usually that takes 30s.
On 2026-10-26 it took 35 to 55 minutes on 6 of the day's runs (run 40361495800: `Fetched 119 MB in
41min 6s (48.3 kB/s)`), while the WebKit tests themselves take about 2 minutes. The day before, every
run was fast. The slow mirror comes and goes, so a re-run is no fix.

## Change

- `e2e-webkit` runs in `mcr.microsoft.com/playwright:v<version>-noble`, which already holds chromium,
  webkit and their system libraries. The browser cache, the cache-miss install and the `install-deps`
  steps are gone.
- The tag comes from a small `playwright-version` job that reads `@playwright/test` from
  `package-lock.json`, so a Playwright bump moves the image with it. It is its own job because `scope`
  is skipped on `workflow_dispatch`, when `e2e-webkit` still runs.
- `--ipc=host` (Chromium's perf budgets need more than Docker's 64 MB `/dev/shm`) and a git
  `safe.directory` for the workspace, as Playwright's Docker guide and the container's git need.

`actionlint` could not be run locally; the workflow parses, and the first run on main is the check.

## Done when

- [ ] A CI run on main shows `e2e-webkit` green in the container, with its two Playwright steps
      reporting the same test counts as before (webkit, then the perf budgets)
- [ ] The job's wall time is recorded here against the 0.5 min / 35-55 min install step it replaces

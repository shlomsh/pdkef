---
id: "QUAL-29"
title: "The e2e jobs run in Playwright's container image, so a slow Ubuntu mirror can't hold CI for 50 minutes"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# QUAL-29 · The e2e jobs run in Playwright's container image

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

- [x] A CI run on main shows `e2e-webkit` green in the container, with its two Playwright steps
      reporting the same test counts as before (webkit, then the perf budgets): run 40394949781 on
      e95c8d4f, 42 passed then 10 passed, the same as run 40361495800 before the change
- [x] The job's wall time is recorded here against the 0.5 min / 35-55 min install step it replaces:
      4 min 23 s for the whole job, of which pulling the image took 26 s (no apt step at all). The job
      used to take 3-5 min on a fast mirror and 45-56 min on a slow one.

## Reopened (2026-10-26): the chromium shards too

Closed one run too early. On run 40394949781, where `e2e-webkit` was green in the container, two of the
four chromium `e2e` shards spent 11 and 13+ minutes in the same `install-deps chromium` step. The `e2e`
job now runs in the same image (same `playwright-version` tag, `--ipc=host`, `safe.directory`), and its
browser cache and install steps are gone. `font-guards` stays on the runner: its pixel thresholds were
measured against the runner's own fonts (`.claude/rules/tests.md`). The chromium project already
excludes the font, export and perf guards, so no pixel-baselined spec moves into the container.

- [x] All four `e2e` shards green in the container on the full chromium suite, text-measuring specs
      included: run 40397523576 on main (3b06c240; Shlomi chose main over a branch run). 142 + 135 +
      149 + 122 passed and 2 + 7 skipped, exactly the counts of run 40390836756 before the move
- [x] No `install-deps` step in either e2e job on that run. The whole run took 4 min 46 s; each e2e
      job 3-4.5 min, image pull included


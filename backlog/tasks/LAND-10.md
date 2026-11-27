---
id: "LAND-10"
title: "landmines 0.4.0: raised Playwright timeouts are counted, and no warm-up import waits in a hook"
status: "done"
priority: "P3"
epic: "honest-tests"
depends_on: ["LAND-09"]
---

# LAND-10 · landmines 0.4.0: raised Playwright timeouts are counted, and no warm-up import waits in a hook

*Filed 2026-11-28.* `@interfere/landmines` 0.4.0 (released 2026-11-27, taken before the 14-day cooldown at
Shlomi's word) has the same 34 rules as 0.3.2. Two of ours see more:

- `no-flake-masking` now reports Playwright's raised timeouts (`test.setTimeout`, `describe.configure({ timeout })`),
  our upstream PR 66: 15 sites in 11 e2e specs, the long budgets of the export guards, the offline workflows, the
  saved-work restore acceptance specs and the hero and toolbar sweeps.
- `no-cold-import-in-test` now also reports an `import()` inside a hook: 12 warm-up loads in 6 files, most of them
  the `beforeAll` imports LAND-09 had just moved there.

## Outcome

- The 12 warm-ups are static imports at the top of their files, so a module loads while the file is collected,
  outside any hook's time budget. The per-test re-imports after `vi.resetModules()` stay where they are.
- The 15 raised timeouts are in `no-flake-masking`'s `allow` map at their per-file counts, so they only shrink, as
  LAND-03's are.
- `scripts/check-ratchet-raises.mjs` accepts a new or higher `allow` count only for a file the base had and the
  change leaves untouched: no code change can add a finding to a file it does not edit, so only a rule that now sees
  more can raise one. A count for an edited or new file still fails, and a padded count fails `lint:landmines` itself (landmines
  reports an allow count above the file's real one), so the exception can only match what the rule finds.
- `lint:landmines` is clean on 0.4.0.

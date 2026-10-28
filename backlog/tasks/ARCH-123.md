---
id: "ARCH-123"
title: "The narrowed share of main runs is reported and acted on"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-123 · The narrowed share of main runs is reported and acted on

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding G1.
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- Narrowing is reported per run, but how often it narrows main pushes was not re-measured; full e2e still runs when the diff reaches shared code (`scripts/affected-scope.mjs`).

## Outcome

- A report of the narrowed share over the last N main runs, then a fix for the shared-code case it exposes.

## Acceptance

- [x] The share is reported in the CI summary.
- [x] A decision on the shared-code cases is recorded in the ticket.

## Measured 2026-10-27

The scope verdict replayed on 58 consecutive pushes to main: 14 docs-only (24%), 30 everything (52%),
12 narrowed (21%), 1 nothing. 24 of the 30 wide pushes also ran the 25 font guards. The window is
skewed by CI-maintenance work (10 of the wide pushes touched `ci.yml`). The fixes this exposed are
QUAL-32 to QUAL-42; QUAL-34 is the shared-code and unowned-file case. The CI summary report is still
to do.

## Done (2026-10-28)

- `scripts/narrowing-share.mjs` replays the scope verdict for each of the last 50 ci.yml push runs on main (each run
  paired with the push before it) against today's project graph, and the nightly `narrowing-share` job writes the
  tally to the run's step summary: docs-only, narrowed, everything (grouped by cause), nothing. Reporting only.
- First reading, 29 pushes: 21% docs-only, 17% narrowed, 59% everything, 3% nothing. Causes of the 17 wide pushes:
  unowned files 7 (6 of them `package.json`), build pipeline 4, CI oracle changed 4, core projects affected 2.
- Decision on the shared-code cases: the two "core project(s) affected" verdicts were correct (`src/data/tools.js`
  and `BaseLayout.astro` reach pages that tool specs visit), so they stay wide. Build-pipeline and oracle changes are
  wide by design. The unowned-file case was QUAL-34's fix; `package.json` is the largest remaining cause.

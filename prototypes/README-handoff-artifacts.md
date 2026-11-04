# Handoff artifacts (reference only, not for main)

- `scan24-screenshots/`: each SCAN-24 camera hint at 390x844 with the fake camera (synthetic page;
  `duplicate-staged.png` has its text swapped in by hand, since SCAN-23 was not merged then).
- `scan21-profiling/`: SCAN-21's timing harness (`run.cjs` main-thread timings, `runcmp.cjs` worker vs
  main comparison, `solvebench*.ts` dense vs banded solve), `before.txt` / `after.txt` results and one
  CPU profile. Paths inside point at the cloud session's scratch folder; adjust before rerunning.
See `docs/scan-enhance-handoff.md`.

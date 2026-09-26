---
id: "SNG-19"
title: "Fill mode becomes Sign's default; the old editor moves behind ?next=0"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-07"]
---

# SNG-19 · Fill mode becomes Sign's default; the old editor moves behind `?next=0`

*Filed 2026-09-26.* Shlomi: "we are ready to flip so the old sign tool becomes the flag and the new is
the default." The flip waits for the iOS Simulator gate (SNG-07) to pass on this branch.

## Acceptance

- [ ] `isFillMode` is true unless the URL says `?next=0`; `?next=1` keeps working, so links already
  shared stay in fill mode.
- [ ] `withFillModeParam` carries `?next=0` across the home page hand-off, the same way it carried
  `?next=1` (SNG-18).
- [ ] The old editor's e2e specs pin `?next=0`, and fill mode's specs drop `?next=1` where the default
  now covers them.
- [ ] The full unit and e2e suites and `check:push` are green locally, then the full CI run on a PR to
  `main` is green before Shlomi pushes.

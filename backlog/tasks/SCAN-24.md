---
id: "SCAN-24"
title: "Scan next: the camera says what would make the shot better"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 3
depends_on: []
---

# SCAN-24 · Guidance while scanning

*Opened 2026-11-04* from Shlomi's phone test: it is not clear when a better angle, more contrast or a
flatter page would help.

## Outcome

The viewfinder's one hint line (today "Point at a page", "Hold still", "Page n. Turn the page.") says
the one thing that would help most, from signals the camera already measures or can cheaply add:

- steep angle (a strongly keystoned quad): hold the phone flatter over the page;
- poor contrast with the background (a light page on a light table): a darker surface helps;
- moving (jitter): hold still;
- too small or cut off at the frame's edge: move closer / fit the whole page;
- `duplicate` (SCAN-23): this page is already taken, turn the page;
- after a page is taken, a strongly bent or creased page (from SCAN-21's measured bend): a quiet note on
  that page that flattening it gives a cleaner scan.

One message at a time, by priority, steady (no flicker between hints), in the voice guide, in
`messages.ts`, announced politely to screen readers, and never blocking a shot.

## Acceptance

- [x] A pure `lib/capture/guidance.ts` choosing the hint, with tests for each condition and for steadiness.
      (`guidance.test.ts`: each condition, priority, steady, hysteresis, screen-reader gap)
- [ ] The viewfinder shows it on a phone, checked on a real iPhone.

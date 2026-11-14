---
id: "SCAN-37"
title: "With Auto off the camera no longer reads \"Page 0. Turn the page.\" before a shot"
status: "done"
priority: "P3"
epic: "scan-next"
order: 9
depends_on: []
---

# SCAN-37 · With Auto off the camera no longer reads "Page 0. Turn the page." before a shot

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

With Auto off and no page taken yet, the hint should not say "Page 0. Turn the page.".

## Acceptance

- [x] A test that fails before and passes after.
- [x] Checked on a real phone or the Scan e2e where the camera is involved.

## Done, 2026-11-14

`hintText` in `viewfinderModel.ts` reads 'turn' with no page taken as the 'point' line, so Auto off and nothing taken
says "Point at a page", never "Page 0. Turn the page.". The test is `hintText('turn', 0, words)` in
`viewfinderModel.test.ts`, seen failing first. The Scan camera e2e passes; the phone sees it on the next photo session.

With Auto off and a page already taken, a hold still reads "Page N. Turn the page." though nothing was shot. That
needs a new line (something like "Tap to take it") and is the owner's wording to pick; it is outside this outcome.

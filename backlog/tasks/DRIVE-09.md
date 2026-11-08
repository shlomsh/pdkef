---
id: "DRIVE-09"
title: "Drive open: a second tap on the Google button does not start a second fetch"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DRIVE-09 · Drive open: a second tap on the Google button does not start a second fetch

*Filed 2026-11-08, from the implicit state machine inventory.* In `src/site-lib/DriveOpen.tsx`,
`start()` (`:92`) only leaves the `ready` phase after `await requestDriveToken()` resolves
(`setPhase({ name: 'working' })` at `:97`). While the token request is open, the button rendered
for `ready` (`:149`) still works, so a second tap starts a second `requestDriveToken()` and, if both
succeed, two `fetchDriveFile` downloads. The later one to finish wins the `chooser` phase. A failure
from either one shows the error even if the other one succeeds.

## Acceptance

- The phase moves to a waiting state (or the button disables) synchronously on the first tap, before
  any `await`.
- Only one `start()` can be in flight. A retry from the error phase still works.
- A unit test taps twice before the token resolves and asserts one token request and one fetch.

## Outcome

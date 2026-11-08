---
id: "DRIVE-08"
title: "Save to Drive: a late failure from an earlier tap no longer ends the newer save"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DRIVE-08 · Save to Drive: a late failure from an earlier tap no longer ends the newer save

*Filed 2026-11-08, from the implicit state machine inventory.* `useSaveToDrive`
(`src/shell/pageWorkspace/useSaveToDrive.ts`) keeps one run's state in shared refs (`channelRef`,
`watchRef`, `stateRef`) with no token naming the run that owns them.

The sequence:

1. Tap Save to Drive. Run A opens its tab, sets `saving` and starts `build()`.
2. Close that tab while A is still building. The tab watcher sets `idle`.
3. Tap again. Run B opens a new tab, sets `saving` and stores its own channel in `channelRef`.
4. A's `build()` now fails. Its `fail()` (`:143`) calls `closeChannel()`, which closes B's channel, and
   sets `failed`.

B's tab may still save the file, but this tab no longer hears the answer and shows a failure.
A's `if (stateRef.current !== 'saving') return` guard (`:154`) does not help, because B put the state
back to `saving`. The same gap lets A's `parkHandoff` success path (`if (!channelRef.current)
setState('idle')`) read B's channel.

## Acceptance

- Each run carries an id (the `id` from `newId()` will do), and every late step of a run (`fail`,
  the post-build check, the post-park check) returns early once a newer run has started.
- `closeChannel()` from an older run never closes a newer run's channel or interval.
- A unit test drives the sequence above with a deferred `build()` and asserts B ends `saved` when its
  channel answers.

## Outcome

Done 2026-11-08. Each tap is a `useLatestRun` run that owns its channel and tab-watch interval as locals; every late step returns early once superseded, and a run only ever closes its own channel. One test drives the ticket's sequence, red ("expected 'failed' to be 'saving'") then green.

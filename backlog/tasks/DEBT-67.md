---
id: "DEBT-67"
title: "Merge's \"a clicked cell lets go of its action buttons\" e2e times out on main"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-67 · Merge's "a clicked cell lets go of its action buttons" e2e times out on main

*Filed 2026-10-27* after it failed twice in five push runs on main.

## Why

`src/tools/merge/e2e/merge-direction-a.spec.js:127` ("a clicked cell lets go of its action buttons when
the pointer moves on") timed out at 45 s in e2e shard 3 (chromium) on 487b5b88 (run 40575030559) and on
5d05772f (run 40587630988). Neither change touched Merge, and the runs between them passed.

Both stop at the same step: after `cells.nth(2).hover()`, the click on
`cells.nth(2).getByRole('button', { name: /^Rotate page/ })` waits about 85 times for the button to be
"visible, enabled and stable" and never gets there. The cluster is revealed by hover only, so anything
that moves the grid between the hover and the click (thumbnails still rendering after `one-file`, a
late layout change) leaves the pointer off cell 2 and the button hidden.

## Outcome

- The spec reveals and clicks the button only once the grid is settled, waiting on a condition rather
  than time, and keeps asserting what it guards (MERGE-08: a clicked cell's cluster closes when the
  pointer moves on; a keyboard-focused cell still shows its own).
- If the grid really does move after `one-file` in a way a person would see, that is fixed in Merge,
  not in the spec.

## Acceptance

- [ ] The cause is named from a trace or a measurement, not assumed.
- [ ] `npx playwright test src/tools/merge/e2e/merge-direction-a.spec.js --repeat-each=30` passes on
      chromium and webkit locally, with no new `waitForTimeout`.

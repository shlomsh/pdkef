---
id: "DEBT-67"
title: "Merge's \"a clicked cell lets go of its action buttons\" e2e times out on main"
status: "done"
priority: "P2"
epic: "robustness"
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

## Cause (measured 2026-10-28)

- After `one-file` the grid is `visibility: hidden` until PageGrid's fit settles
  (`.grid:not([data-fit-settled])`, MERGE-24). This test hovers before that, so `hover()` logs "element is
  not visible" and retries.
- Playwright counts those retries, and it picks each retry's scroll alignment as the retry count
  modulo 4: none, `end`, `center`, `start` (`_retryPointerAction`, playwright-core 1.64.1). When the
  grid shows on the 4th attempt, the cell is scrolled to `block: 'start'`. Cell 2's top lands at y 0, so
  its Rotate button (31 to 63 px) sits under the 57 px sticky app bar.
- The click then hits the bar ("intercepts pointer events"). Its own retry scrolls with `end`, the
  pointer leaves cell 2, the hover-only cluster hides, and the click waits on "not visible" until the
  45 s timeout. This matches both CI call logs; `DEBUG=pw:api` reproduced the sequence locally.
- The grid itself does not move: every cell stays 254 px tall and scrollY stays 0 in every measured
  frame. Overlap rate by load: 1/70 at base, 3-4/40 at 6x CPU throttle, 14/40 with 4 parallel pages,
  16/48 with 8 parallel pages at 6x throttle (10 of them click timeouts).
- Product gap found on the way: nothing in a page grid sets `scroll-margin-top`, so anything scrolling a
  cell to its start (Tab onto a cell partly under the bar does) leaves the cell's top and its action
  buttons under the app bar. The fix clears the app bar only: below 1024px Merge's sticky chip row
  sits under it at a height that wraps, and a cell scrolled to its start can still land under that row.

## Acceptance

- [x] The cause is named from a trace or a measurement, not assumed.
- [x] `npx playwright test src/tools/merge/e2e/merge-direction-a.spec.js --repeat-each=30` passes on
      chromium and webkit locally, with no new `waitForTimeout`.

## Done (2026-10-28)

- Both tests that touch the grid right after `one-file` now wait for `ul[data-page-grid][data-fit-settled]`.
- PageGrid cells and the buttons and links in them carry `scroll-margin-top` for the app bar. A new
  e2e test scrolls a cell and its Rotate button to their start and checks that both clear the bar; it
  was seen failing before each rule.
- `--repeat-each=30` on the whole spec file: 210/210 on chromium and 210/210 on webkit, run before
  and after the review fixes.

---
id: "QUAL-56"
title: "Sign's rotate-page test passes every time, not most times"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# QUAL-56 · Sign's rotate-page test passes every time, not most times

*Filed 2026-11-12.* `src/tools/sign/e2e/sign-rotate-page.spec.js:60` ("Rotate turns the page on screen and in
the export; marks stay on their content") failed twice in a row on main in CI and passed on the third run
with no code change, so a landing was held up by a test that says nothing about the change.

## What happened

- CI runs 43276006108 and 43277555644 (first attempt), chromium, product shard 4 of 4: the test failed both
  times at line 79, `await expect(mark(page)).toBeVisible()`, with "element(s) not found" for
  `[data-editor-element]`. The Whiteout mark the test had just dragged was never created.
- The rerun of the failed job in 43277555644 passed. The same test passed in three CI runs earlier the same
  day on a tree with the same files. The shard ran the same 184 tests each time.
- The test already guards one race at this step: it waits for the Whiteout button to read as armed before
  the drag ("a nightly repeat lost that race"). The drag is still being dropped sometimes after that wait.

## What is not known

Whether the drop is in the test (the pointer sequence starting before the page wrapper is ready to take a
create gesture, or the bounding box read before layout settles) or in Sign (an armed tool that sometimes
ignores the first press). The second would be a product bug a person could hit, so find out which before
adding a wait.

## Done when

- The cause is named, with a run that reproduces the failure on demand (for example `--repeat-each`).
- The test waits on the real readiness condition, or the product bug is fixed and covered.
- Fifty repeats of the test pass in CI's container.

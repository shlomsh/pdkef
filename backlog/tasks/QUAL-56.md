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

## Diagnosis so far (2026-11-12)

850 instrumented repeats (12 to 16 workers, some with eight busy loops on top) logged the wrapper's box,
`scrollY`, `document.elementFromPoint` at the press point and the mark count before the press, mid-drag and
after release. None reproduced the line 79 failure; an earlier plain run failed once in 120.

- **Not a layout shift**: the wrapper's box was identical in every run and the page never scrolled.
- **Not a covering element**: the press always hit the page overlay.
- **A second flake in the same test**: one run under CPU stress timed out at line 120, waiting for the
  download in the export step. Count it separately.
- **The remaining suspect, from reading only**: `handleOverlayPointerDown` in
  `src/tools/sign/hooks/useWorkspaceGestures.ts` starts with `if (!selectedTool) return;`. If the toolbar
  button gains its `active` class one render before that handler sees the tool, a press in the gap is ignored
  in silence, which matches the failure snapshot (tool armed, Undo disabled, nothing created). Not measured.

Next step: log `selectedTool` inside that handler and run under a throttled CPU, to confirm or clear it.

## Done when

- The cause is named, with a run that reproduces the failure on demand (for example `--repeat-each`).
- The test waits on the real readiness condition, or the product bug is fixed and covered.
- Fifty repeats of the test pass in CI's container.

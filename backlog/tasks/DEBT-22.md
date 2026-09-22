---
id: "DEBT-22"
title: "tool-layout.spec.js's first-paint restore test fails intermittently in CI and nowhere else"
status: "open"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# DEBT-22 · tool-layout.spec.js's first-paint restore test fails intermittently in CI and nowhere else

`e2e/tool-layout.spec.js`'s "uses the hydrated Sign/Redact density geometry for a validated first-paint
restore only" failed on main in CI run 35763137317 (commit 8ae14e7), at
`expect(firstPaintRestore).not.toEqual(fresh)`: setting `data-editor-restore` on `<html>` did not condense the
hero. The re-run of the same commit passed.

**What is established.** Locally the unmodified test passed 112 of 112 on that commit and 56 of 56 on the
commit before it, whole file, two workers. The commit it failed on changed one CSS rule for
`.quick-field-nav[dir="rtl"] svg`, which shares no selector with `.tool-hero`.

**What is not.** The cause. Two theories were tested and neither holds:

- *The island's draft check clears the marker mid-test* (`clearDraftHintAttribute` in `useDraftPersistence.js`
  removes `data-editor-restore`, and the test does not wait for hydration). Waiting for hydration and the check
  to settle made it **worse** locally - 2 failures in about 77 runs - so that is not the whole story, and that
  change was discarded rather than shipped.
- *CPU contention* - a 6x throttle did not reproduce it.

An instrumented run that logged a stack for every write to `data-view-density`, `data-editor-restore` and
`data-draft-hint` passed 52 of 52 and so caught nothing.

**Next step.** Pull the failed run's Playwright trace (the `playwright-artifacts-product-shard-1` artifact on
that run) and read the page's state at the failing measurement, rather than theorising further. The test
writes `<html>` attributes that live code also writes, on a page whose island is hydrating, and measures in
the same breath; whatever the mechanism, a test that races the app it measures is the thing to fix.

---
id: "DEBT-22"
title: "tool-layout.spec.js's first-paint restore test fails intermittently in CI and nowhere else"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
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

## Closed 2026-10-01

No tool-layout first-paint failure has appeared in the main e2e runs since 2026-09-22. Reopen if it recurs.

## Reopened 2026-10-01

It recurred the same day: CI run 36847659395 (main at 631196fc, a vitest 5.0.0 -> 5.0.1 bump that
touches no browser code), e2e shard 1, `e2e/tool-layout.spec.js:86` "uses the hydrated Sign/Redact
density geometry for a validated first-paint restore only": `expect(firstPaintRestore).not.toEqual(fresh)`
failed, the restore measured the fresh hero geometry (height 202.375, title 32px). The race is still
there; the retirement was wrong.

## Fixed 2026-10-01

**Root cause.** The test raced the app it measures, exactly as the ticket suspected. It set `data-editor-restore`
on `<html>` in one `page.evaluate` and measured in the next, five round trips in all. On a visit with no saved
draft the hydrating Sign island's mount-time restore check (`useDraftPersistence.js`, the "no record" branch) ends
in `clearDraftHintAttribute()`, which removes both `data-draft-hint` and `data-editor-restore`. That is an
IndexedDB callback, so it lands some 50-300ms after load, whenever the open and read finish. When it landed
between the test's set and its measure, the hero measured fresh (202.375px, 32px title) and
`expect(firstPaintRestore).not.toEqual(fresh)` failed. The app is behaving as intended: a restore marker with
nothing behind it is meant to be cleared.

**Evidence.**
- The failed run's artifact (36847659395, `playwright-artifacts-product-shard-1`) holds only the page snapshot
  (the empty "Drop PDF here" state: no restored editor, so nothing re-armed the marker) and no trace, because
  `trace: 'on-first-retry'` and the failing attempt was the first.
- A `removeAttribute` shim on `document.documentElement`, run 8 times against `astro preview`, logged both
  removals in all 8 runs, from `clearDraftHintAttribute` via the restore effect, at 285-540ms after navigation,
  against the test's own set at 184-354ms. The window is real on every run; the test only wins when its round
  trips finish first.
- Locally, with a Chromium on 2 workers, the unmodified test failed 4 of 60 and then 25 of 300 (about 8%). The
  earlier instrumented run (52 of 52 green) and the 6x CPU throttle missed it because they changed timing without
  changing the order. The "waiting for hydration made it worse" result fits too: a wait spent exactly the time
  during which the clear lands, and the test then ran on a page whose app write had already happened.
- No CSS transition or animation is declared on `.tool-hero` or its children (`ToolHero.astro`,
  `ToolPageLayout.astro`), so a synchronous read sees settled values.

**Fix** (test only, `e2e/tool-layout.spec.js`). Each step now sets the complete marker state it needs and
measures inside one `page.evaluate`. Reading layout forces a synchronous style recalc and no app task can run
inside one evaluate, so the measurement can only see what that step wrote. The same evaluate reads the markers
back (density, hint, restore, control), and the test asserts them, so "the marker was not there" can no longer be
a silent cause. All assertions and the test's intent are unchanged; no retry, sleep or skip was added.

**Verification.** `--repeat-each` on the one test, 2 workers: unmodified 4 of 60 and 25 of 300 failed; fixed
60 of 60 and 300 of 300 passed, and the whole `tool-layout.spec.js` passes. Forcing the race (an init script that
removes both markers from a 0ms timer loop) fails the old test 17 of 20 and the fixed test 0 of 60, so the fix is
immune to the app write by construction rather than by luck.

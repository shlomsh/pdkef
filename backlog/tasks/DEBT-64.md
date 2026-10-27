---
id: "DEBT-64"
title: "Merge's phone chip test passes alone and fails under parallel load"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-64 · Merge's phone chip test passes alone and fails under parallel load

*Filed 2026-10-27* while landing the unify-and-narrow branch.

## Why

`src/tools/merge/e2e/merge-mobile.spec.js:491` ("a chip remove button is a 44px target on a 36px
pill and removes that file") waits 10s for three chips after `setInputFiles` and sees none. Measured
on a production build with `--repeat-each=5 --workers=4` on the whole spec file: origin/main
(9d9331db) failed it 4 of 5 times, the unify-and-narrow branch 1 of 5; run alone with one worker it
passes 5 of 5. The rest of the file passes under the same load, so it reads as this test's own
wait (or a phone-viewport path that renders chips later than the others), not a product failure.
A flaky e2e on main costs every push that selects Merge.

## Outcome

- Find what the chips wait on under load (thumbnail decode, the quiet preparer, the viewport
  helper) and make the test wait for that, or fix the product if the chips really appear late.
- The spec file passes 10 of 10 with `--repeat-each=10 --workers=4`.

## Acceptance

- [x] The cause is named in this ticket with the evidence.
- [x] `--repeat-each=10 --workers=4` on the spec file is green on a production build.

## Done

*2026-10-27.* No product change and no new test edit: the cause was already fixed by `aac3ebe7`
("Merge's chip-remove spec waits for hydration"), which landed after the 9d9331db measurement
(9d9331db is its ancestor) and is in this branch's base.

**Cause.** The chip test called `setInputFiles` on the server-rendered `<input type="file">` right
after `page.goto`, with no wait for the island. If the `change` event fires before Preact hydrates the
handler, it is lost and no chip ever renders, so the 10 s wait saw none. It passed alone only because
hydration usually beat `makePdfBuffer`; under 4 workers it did not. Every other test in the file
already waited for the island.

**Evidence.** A throwaway spec (deleted) slowed `/_astro/*.js` by 1.5 s: the old flow (goto, build
PDFs, `setInputFiles`, no wait) saw 0 chips after 8 s and failed; the same flow with
`waitForIsland` passed. All 12 `goto` calls in `merge-mobile.spec.js` are now followed by
`waitForIsland`, and no other Merge spec sets files without one. The pre-fix spec did not fail on the
unloaded production build here (0 of 10 failures with 4 workers), so the slowed-script run is the
reproduction, not the original 4-of-5.

**Result.** `npm run build`, then `PLAYWRIGHT_PORT=4533 npx playwright test
src/tools/merge/e2e/merge-mobile.spec.js --project=chromium --repeat-each=10 --workers=4`: 140 of 140
passed (14 tests x 10); with webkit as well, `--repeat-each=5`: 140 of 140 passed.

---
id: "DEBT-64"
title: "Merge's phone chip test passes alone and fails under parallel load"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 9
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

- [ ] The cause is named in this ticket with the evidence.
- [ ] `--repeat-each=10 --workers=4` on the spec file is green on a production build.

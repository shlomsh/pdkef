---
id: "QUAL-46"
title: "The branches that keep a person's work safe have unit tests: drafts across tabs, saved signatures, share, a second finger"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 1
depends_on: []
---

# QUAL-46 · The branches that keep a person's work safe have unit tests: drafts across tabs, saved signatures, share, a second finger

*Filed 2026-11-03* from the unit-test audit recorded in QUAL-45. These were found by reading, not by a planted
mutant, so each starts by confirming the gap with a mutant before the test is written.

## Why

Each of these protects a person's work or a gesture's single commit, and no unit test reaches it:

- `src/lib/gestures/controller.ts:42` cancels a gesture when a second finger lands (MOBI-31), and `blur` and
  `visibilitychange` cancel too. `controller.test.ts` has three tests and only `touchcancel` among the cancels,
  so deleting the multi-touch branch would let a pinch commit a drag or resize patch.
- `src/tools/sign/hooks/useSavedSignatures.ts` (saving, deleting and the cross-tab `activeAfterSync` path) has no
  test. A missing `persistSavedSignatures` call loses a saved signature.
- `src/lib/drafts/draftStore.ts`: no test saves and then reads the `draft-change` signal, or sends one with the
  tab's own writer id, so a tab could warn about its own save, or never about another tab's. No test runs two
  `saveDraft` calls at once (no `Promise.all` in any draft test), so a lost update or revision collision would
  pass. The `takeHandoff` expiry (`HANDOFF_MAX_AGE_MS`) is not exercised.
- `src/lib/output/usePdfShare.js`: the double-tap guard (`sharingRef`, which stops two files reaching the
  pasteboard on macOS) and the AbortError-to-`canceled` mapping are untested; `usePdfShare.test.jsx` has one
  test and `useDownloadFlow.test.tsx` mocks the whole hook.

## Outcome

- Each branch above has a unit test that fails when the branch is deleted or inverted, and passes on today's
  code.

## Acceptance

- [ ] Each branch's mutant is shown surviving today, then failing with the new test.
- [ ] The concurrent-save test uses the real `fake-indexeddb` store, not a mock.
- [ ] `npm run check:fast` and `npm run check:push` pass.

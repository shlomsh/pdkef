---
id: "QUAL-36"
title: "Editing a dist guard script runs the build and dist guards locally"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# QUAL-36 · Editing a dist guard script runs the build and dist guards locally

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `fileCannotReachDist` (`scripts/check-push.mjs:99`) reports `scripts/verify-seo.js`,
  `scripts/verify-csp.js`, `scripts/check-page-weight.js`, `scripts/check-precache-budget.mjs` and
  `scripts/check-trailing-slash-redirects.js` as unable to reach dist, so a diff that edits one of them
  runs no build and none of the dist guards in `check:push`. CI still runs them, so this is a local
  blind spot, not a CI gap.

## Outcome

- A script that a `test:*` dist guard in `package.json` runs counts as reaching dist, derived from
  `package.json` rather than hand-listed, so a new guard is covered without an edit here.

## Acceptance

- [x] A `scripts/check-push.test.mjs` case for each current dist guard script.
- [x] A test that a new `test:*` entry pointing at a dist guard is picked up with no list to update.

## Done (2026-10-28)

`distGuardScripts` (scripts/check-push.mjs) walks the package.json command of every `DIST_GUARD_STEPS` entry with the shared `scriptClosure` (new scripts/script-closure.mjs, also used by `buildPipelineFiles`; an oracle file). Derived set: check-animation-shorthand.js, check-built-html-comments.js, check-class-resolution.js, check-color-literals.mjs, check-css-duplication.js, check-dead-utilities.js, check-editor-global-css.js, check-lazy-modules.js, check-page-weight.js, check-precache-budget.mjs, check-trailing-slash-redirects.js, verify-csp.js, verify-seo.js, plus their imports localizedSeoChecks.mjs, pageHash.mjs, precacheClosure.mjs, ratchet-limits.mjs, repoOnlyFiles.mjs. Editing any of them now builds and runs the dist guards in `check:push`.

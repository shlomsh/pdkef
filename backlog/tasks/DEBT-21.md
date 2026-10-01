---
id: "DEBT-21"
title: "Nothing checks that a navigating-away flag uses the hook that survives a Back"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# DEBT-21 · Nothing checks that a navigating-away flag uses the hook that survives a Back

*Filed 2026-09-22 out of the review of the stuck-launcher fix. That change converted all four sites
and wrote the rule; this is the guard the rule does not have.*

## What is missing

`.claude/rules/tools-and-shell.md` now states an invariant: a flag that disables a control for the
navigation it starts is `useNavigatingAway()`, never a plain `useState(false)`, because a bfcache
restore brings the flag back set and leaves the control dead. CLAUDE.md's own framing is "invariants
are checks, not prose", and this one is prose. Nothing stops the next `const [busy, setBusy] =
useState(false)` written beside a `window.location.href =`, and the failure is invisible in every
test we run by default: jsdom cannot restore a page, and Playwright launches Chromium with
`--disable-back-forward-cache` (see the rule, and `e2e/home/back-navigation.spec.js`, which drops
that switch).

The four navigation sites today are `src/site-lib/FileDropzone.tsx`, `src/tools/merge/PdfMergeTool.tsx`,
`src/tools/split/PdfSplitTool.tsx` and `src/tools/redact/PdfRedactTool.tsx`, all converted.

## Why it is P3, and why a naive check will not do

The obvious script - flag any file that assigns `window.location.href` and also calls
`useState(false)` - is wrong on the current tree: `PdfMergeTool.tsx` legitimately holds
`isRestoredWorkspace` that way, and a false positive on a green tree is how a guard gets deleted. A
useful check has to tie the flag to the navigation (the state whose setter is called on the path that
assigns `location.href`, or that gates the disabled attribute of the control that navigates), which
is real work for one class of bug that currently has four known instances and an e2e over the worst
of them.

## Scope

- [x] Decide whether this is a `scripts/` guard (in `test:dependency-governance`, where the other
      source-shape checks live) or a lint rule, and write it so the current tree is green without an
      allowlist entry.
- [x] A sabotage control in the same commit: convert one site back to `useState(false)` and show the
      check fails.
- [x] Optional, cheap, and independent of the above: a site-level unit guard for Split's hand-off,
      the way `PdfMergeTool.test.tsx` has one. Split takes an injectable `navigate` prop exactly like
      Merge, so it is a near-copy of that test. Redact assigns `window.location.href` directly
      (`PdfRedactTool.tsx`, `requestCompressHandoff`), so it has no cheap unit guard; leave it to the
      hook's own test unless the check above lands.

## Acceptance

- Reintroducing a plain `useState(false)` at any of the four sites fails a check by name, with no
  false positive anywhere in `src/`.

## Done (2026-10-01)

- `scripts/check-navigating-away.mjs` (`npm run test:navigating-away`), a source-shape guard parsed with
  the TypeScript compiler API, in CI, `check:fast` and `check:push`. A navigation is an assignment to
  `location.href` / `window.location`, `location.assign` / `replace`, or a call to an injected `navigate`;
  a violation is a `useState` setter set to true in the function (or callback chain) that navigates.
  Setters inside a `catch` are the failure path and do not count, which keeps Merge's and Split's
  `handoffFailed` and Merge's `isRestoredWorkspace` green with no allowlist.
- Sabotage: each of the four sites reverted to `useState(false)` fails by file:line and flag name;
  re-checked by the lead on Redact, the one site with no unit guard. 21 unit tests.
- Split's hand-off has its site-level unit guard (`PdfSplitTool.test.tsx`, fails with the hook reverted).

---
id: "MERGE-28"
title: "Pick from Drive inside PDkef: Google's Picker, only if real people ask"
status: "open"
priority: "P3"
epic: "polish"
horizon: "later"
depends_on: ["MERGE-25", "MERGE-27"]
needs: "Evidence that people want it, and your sign-off on a wider Google exception"
---

# MERGE-28 · Pick from Drive inside PDkef

*Drafted 2026-11-03.* A "Pick from Drive" button inside PDkef, for people who start in PDkef and not in
Drive. Parked on purpose: Open with (MERGE-25) and the phone OS picker already cover loading, and
MERGE-27 makes that known. Build this only if feedback and the Drive-arrival funnel show people still
asking.

## Why it is the heavy option

Google's Picker needs more than MERGE-25's sign-in: a third-party script from `apis.google.com`,
`frame-src` for a Google-hosted picker, and `connect-src` additions. It is Google's UI and Google's
code running in our page, which we cannot audit or pin, and it can change without a deploy.

## Containment if it is ever built

- Only on `/drive/` (a pick mode), never on a tool page; a tool's "Pick from Drive" link navigates
  there, like Save to Drive (MERGE-26), and the chosen file comes back through the same hand-off.
- `test:csp` extended to name every added origin and assert it appears on `/drive/` only.
- The invariant gets one more clause for the Picker's origins, written by Shlomi.
- Quiet secondary link in the empty state, hidden offline, never a prompt.

## Decide first

Measure before building: how many arrivals come through `/drive/` by Open with, and how many feedback
messages ask for in-app picking. If Open with covers the demand, close this as retired.

## Acceptance

- Evidence recorded here with dates, and Shlomi's decision.
- If built: the Picker works on desktop and iPhone on a production build; no other page changes its
  CSP; `test:csp` green.

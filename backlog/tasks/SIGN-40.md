---
id: "SIGN-40"
title: "Sign: Preact NotFoundError while arming a tool or placing a mark"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# SIGN-40 · Sign: Preact NotFoundError while arming a tool or placing a mark

*Found 2026-10-06 in the daily error read.* 10 reports, Chromium 154, `/sign/`, build d1feb33,
under a minute into the session. The reported actions were `arm_tool` and `place_mark`, and the area
was an unhandled rejection. Every frame is in Preact's diff, ending in `insertBefore`: Preact went to
insert next to a node that is no longer where it left it. Something outside Preact moved or removed a
node Preact owns. Likely candidates are a browser translation extension, or our own DOM mutation around
mark placement after an await. No report since.

## Scope

- Find which of those it is, with evidence.
- If it is our code, fix it with a failing test first. If it is a browser extension, decide whether
  the reporter should mark it as such and record the outcome here.

## Acceptance

- [ ] The cause is named with evidence in this ticket.
- [ ] Our code: the fix lands with its test and a `docs/error-known-items.json` entry. Otherwise: an
      `open` entry or reporter change, so it stops reading as new.

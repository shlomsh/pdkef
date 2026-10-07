---
id: "SIGN-40"
title: "Sign: Preact NotFoundError while arming a tool or placing a mark"
status: "blocked"
priority: "P2"
epic: "robustness"
waiting_on: "The next Sign NotFoundError report, with the translated flag"
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

## Progress

- Sign's path has no hand-written DOM mutation of Preact-owned children (static read of `src/tools/sign`,
  `src/editor`, `src/editor-ui`, `src/lib/gestures`). `place_mark` is recorded after the dispatch, before the
  render, so the render that throws is the one the placement causes. Preact defers renders to a microtask,
  which is why it reads as `unhandled_rejection`.
- Translation does not reproduce in `EditorToolStatus`: a jsdom test that swapped every text node for
  `<font><font>` and stepped through arm, lock, tool switch and disarm stayed green. Every text there is
  already the sole child of its element.
- Reports now carry `translated: true` when `<html>` has `translated-ltr` or `translated-rtl`
  (`abda38a3`, stored in the sample by `f5c5dca9`), and `errors:read` prints it. The registry has an `open`
  SIGN-40 entry, so the fingerprint stops reading as new.
- Next: when it recurs, the flag names translation or rules it out. Candidates still unchecked are
  `ArmHint.tsx` (a portal into `document.body`) and `SignToolbar.tsx`.

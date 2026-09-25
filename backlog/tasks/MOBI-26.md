---
id: "MOBI-26"
title: "Creating a text box from a tap on an iPhone may not raise the keyboard"
status: "retired"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-24"]
legacy_state: "Open"
---

# MOBI-26 · Creating a text box from a tap on an iPhone may not raise the keyboard

Split out of MOBI-24, which fixed re-entering an existing box by tap.

- The other routes into a session have the same shape: a box created by tapping a detected field, and
  Next/Previous landing on a field. Both focus from an effect. Where a keyboard is already up, iOS keeps it
  across a programmatic focus change, so Next/Previous while typing is likely fine; creating the first box
  from a tap is not. Confirm on a real iPhone, and if the keyboard does not come up, focus synchronously
  in the creating gesture (a proxy input focused in the tap, handing focus to the textarea when it mounts,
  is the usual pattern).
- No automated check can see the iOS keyboard. Until one exists, any change to how a text session opens on
  touch needs a real-phone check on a Vercel preview before it reaches `main`.

## Retired 2026-09-25 into the next-generation Sign

Retired, not fixed. Shlomi stopped local mobile fixes on 2026-09-25, because each one was locally right and
created the next edge. This ticket is a symptom of a cause the new editor removes by design. Its failure
case is carried into SNG-05's acceptance. See `docs/sign-next-gen.md` §1-2 and the SNG epic.

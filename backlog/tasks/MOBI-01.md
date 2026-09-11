---
id: "MOBI-01"
title: "Verify the Android share-sheet round trip on real hardware"
status: "blocked"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MOBI-01 · Verify the Android share-sheet round trip on real hardware

## Scope and acceptance

**The shortcut that this whole epic is built around has never been run once.** DEMO-03 shipped the
`share_target` and `file_handlers` entries in `public/manifest.webmanifest`, the `handleShareTarget`
POST interception in `public/sw.js`, and the IndexedDB handoff that `/sign/` picks up through the same
`loadPdf()` path as a fresh pick. Its own closing note says so plainly: everything is verified by unit
tests and by reading the spec, which is not the same thing. Nobody has installed the PWA on an Android
phone and shared a PDF into it from a chat.

That matters more than a normally-untested feature would, because two other tickets are priced against
it. MOBI-06 proposes prompting for install specifically so this path becomes available, which is only
worth building if the path works. And the step counts this epic is trying to reduce assume the
installed-Android flow is three taps in, which is an assumption nobody has checked.

Do the round trip, on a real phone, end to end: install PDkef from Chrome on Android, receive a PDF in
WhatsApp or Gmail, long-press and share it into PDkef, confirm it opens in the Sign editor with the
document loaded, fill and sign it, and share it back to the same chat. Record what actually happened at
each tap, including anything the ticket did not predict: whether PDkef appears in the share sheet at
all and how far down, whether the service worker was active on the first share after install, whether
the 303 lands on `/sign/` with the file or with an empty dropzone, what the file is called on the way
back, and how many taps the return leg really takes.

This is a verification ticket, not a code ticket. If it finds defects, they become their own tickets
rather than growing this one.

**Acceptance.** A written record in this ticket of the observed round trip on named hardware and a
named Android and Chrome version, tap by tap, with the real total. Any divergence from what DEMO-03
assumed is stated explicitly, and each defect found is filed separately and linked here. If the path
does not work, say so and say where it breaks; a negative result closes this ticket just as well as a
positive one, and it is what MOBI-06 needs in order to be worth starting.

## Status 2026-09-11: blocked

Marked blocked by Shlomi on the board cleanup: verifying the Android share-sheet round trip needs real
hardware, which is not available right now. MOBI-08 stays gated on it. Unblocks when an Android phone
with Chrome and WhatsApp is to hand for half an hour.

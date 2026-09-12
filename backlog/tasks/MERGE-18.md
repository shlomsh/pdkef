---
id: "MERGE-18"
title: "Pick files from Google Drive: decide between the OS picker route and a Drive Picker that breaks the no-external-connect invariant"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "later"
depends_on: ["MERGE-11"]
legacy_state: "Open"
---

# MERGE-18 · Pick files from Google Drive: decide between the OS picker route and a Drive Picker that breaks the no-external-connect invariant

*Filed 2026-09-13* on Shlomi's ask during the Merge review: "allow users to pick files from their
Google Drive". This is a decision ticket first, because the obvious build collides with the first
invariant in CLAUDE.md.

## The collision, stated plainly

Google's Picker needs three things PDkef has ruled out: a third-party script from
`apis.google.com` (the `script-src` allowlist and `test:csp` fail on it), an OAuth token and Google's
cookies (the "no cookies or accounts" line), and a `fetch` of the chosen file from
`www.googleapis.com` (`connect-src 'self'` is the backstop that proves "files never leave the
device"; it also has to be the backstop for "no third party sees which files you open"). The bytes
flow from Drive to the device, not the other way, so the privacy promise is not literally broken, but
the CSP that lets a visitor verify the promise would be, and so would the offline story: the Picker
does not load without a connection.

## Two routes

**Route A, no integration, ships in a day.** Every mobile OS picker already lists Google Drive:
Android's document provider shows Drive next to Downloads, and iOS Files shows it once the Drive app
is installed; Drive for Desktop mounts as a folder on macOS and Windows. So "Choose files" opens
Drive today, and nobody knows it. Make it known: one line under the picker on phones, in the style of
the iOS Files hint MOBI-09 added to Sign ("On a phone, Choose files can open Google Drive, Dropbox or
iCloud too"), and a FAQ entry on `/merge/` that says how, per OS. Covers Dropbox and OneDrive for
free, needs no consent screen, keeps every invariant.

**Route B, the Picker, only if Shlomi rewrites the invariant.** A `script-src` and `connect-src`
exception for Google's hosts, OAuth client registration and verification with Google (the app asks
for `drive.file` scope, which shows a consent screen and, at volume, a verification review), a
"Connected to Google" state with a disconnect, a note on the trust pages that this one path talks to
Google, the precache manifest and `test:csp` taught the exception, and a fallback when offline. Two
to three weeks and a permanent widening of the promise. Import from Drive is what every upload-based
competitor offers because they already hold the bytes on a server; for us it is the one feature that
makes the CSP stop proving the claim.

## Recommendation

Ship Route A inside MERGE-11's disclosure work and measure whether anyone asks for more (the
feedback link and the funnel in MERGE-16). Take Route B only on evidence, and only after CLAUDE.md's
first invariant is rewritten by Shlomi to name the exception, since every agent reads that line before
touching the CSP.

## Acceptance

- Shlomi's decision recorded here with the date.
- If Route A: the hint and the FAQ entry live on `/merge/` and `/he/merge/`, `test:seo` green, no CSP
  change.
- If Route B: a separate build ticket with the CSP diff, the consent copy and the trust-page note as
  its own acceptance list; this ticket closes as the decision.

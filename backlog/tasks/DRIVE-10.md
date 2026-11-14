---
id: "DRIVE-10"
title: "Drive Open with: reuse the saved token, sign in quietly on desktop Chrome"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# DRIVE-10 · Drive Open with: reuse the saved token, sign in quietly on desktop Chrome

*Filed 2026-11-14, from Shlomi opening a file with Drive's "Open with > PDkef" on desktop Chrome.*
Every Open with stopped on "Sign in with Google", even minutes after the last one. DRIVE-01 gave the
pick route (`?pick=1`) the saved token and the one-tap redirect, but the Open with route in
`src/site-lib/DriveOpen.tsx` kept the MERGE-25 button: it never read `savedToken()` and always asked
Google again through the popup on a tap.

## Outcome

- A saved token that is still good fetches the file straight away, no screen.
- With no saved token, desktop Chrome (the `redirect` route of `driveRoute.ts`) signs in by redirect
  with `prompt=none` and fetches on the way back, as the pick route does.
- Browsers on the `popup` route, a token Google rejects (forgotten, then the button), and a failed
  redirect sign-in all land on the Sign in with Google button as before.
- Unit tests for each case in `DriveOpen.test.tsx`, seen failing first.

Done 2026-11-14. Open with now takes the redirect's token or the saved one and fetches with no screen;
with neither, desktop Chrome goes to Google with `prompt=none`; everything else, a refused redirect,
and a saved token Google rejects (forgotten) or that cannot see the file land on the button. The popup
token is remembered too, so the next Open with within the hour needs no tap. Seven cases in
`DriveOpen.test.tsx`, five red before the fix. The Google button moved to `GoogleSignInButton.tsx` to
keep `DriveOpen` under its size record. Not yet checked against real Google: whether a token saved on
one file reads a second file granted later through Open with (expected under `drive.file`).

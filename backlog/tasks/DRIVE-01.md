---
id: "DRIVE-01"
title: "/drive/ picks a file: saved token, one tap where it is proven, the popup everywhere else"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
order: 1
depends_on: ["MERGE-25"]
---

# DRIVE-01 · /drive/ picks a file

The base of the app-wide Google Drive work, approved 2026-11-05. `/drive/` stays the only page that
talks to Google; every other page only links to it.

Measured on a throwaway site, 2026-11-05: redirect sign-in opens the Picker in one tap on desktop
Chrome (back from Google in 0.6s, no screen). On iPhone Chrome the same route fails inside Google's
frame ("Can't access your Google Account", cookies blocked in the frame), and the GIS popup route
works, CSP on. So the popup is the default and one tap is switched on only for browsers seen working.

## Acceptance

- `/drive/?pick=1&return=<path>[&tool=<slug>]` shows the Picker: by itself on the redirect route, after
  one tap on the popup route. List view, file types the target accepts, double-click picks.
- The token lives in localStorage on `/drive/` only, until it expires. Tool pages never read it.
- A pick returns the person to `return` with the file, as if they had dropped it there.
- A closed picker leaves no frame behind.
- The CSP exception is on `/drive/` alone; `test:csp` fails if any Google origin reaches another page.
- "Open with" from Drive keeps working. The sign-in button follows Google's branding rules.

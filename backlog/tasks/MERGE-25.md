---
id: "MERGE-25"
title: "Open PDFs from Google Drive's Open with menu: a Drive app, which needs the first invariant rewritten"
status: "in_progress"
priority: "P3"
epic: "polish"
horizon: "now"
depends_on: ["MERGE-18"]
needs: "Your sign-off on the rewritten invariant, then the Google Cloud and Marketplace setup in your account"
---

# MERGE-25 · Open PDFs from Google Drive's Open with menu

*Filed 2026-11-02; invariant approved 2026-11-02.* MERGE-18 chose Route A (the OS picker) for picking Drive files from inside PDkef.
This is the other direction, and it is MERGE-18's Route B: in Drive, right-click a PDF, Open with,
PDkef, the way DocHub and Lumin PDF appear there today. Nothing below is built until the invariant
wording is approved.

## Why it cannot be done without the exception

Drive opens the registered URL with `?state={"ids":[...],"action":"open","userId":...}`, a file id and
no bytes. PDkef must fetch the file itself, which needs a Google sign-in and a `fetch` to
`www.googleapis.com`. The bytes flow Drive to device, nothing is uploaded, but `connect-src 'self'` and
the "no accounts" line stop being literally true.

## Invariant wording to approve (CLAUDE.md, first invariant)

> No file bytes ever leave the device. The one exception is the optional Drive app: when someone opens
> a file from Google Drive, PDkef signs in with Google (`drive.file` scope, only on that route) and
> fetches that file from `www.googleapis.com`. No other page loads a Google script or connects to
> Google. Nothing is ever uploaded to Google unless the person saves back.

## Scope

- **Isolated route.** A dedicated `/drive/` entry page that reads `state`, loads Google Identity
  Services and fetches the file, then hands the bytes to the normal Open with chooser. No other page
  gets the script or the wider CSP.
- **CSP.** `script-src` for `accounts.google.com/gsi/client` and `connect-src` for `www.googleapis.com`,
  scoped by a per-path header in `vercel.json` for `/drive/` only. `test:csp` taught the exception and
  asserting it appears nowhere else. Verified on `npm run build && npm run preview`.
- **States.** Signed-in state with a disconnect, offline fallback ("Drive needs a connection; download
  it and drop it here"), expired or denied token, shared files needing `resourceKeys`.
- **Trust pages and copy.** One plain paragraph that this one path talks to Google, in the site voice.
- **Precache.** The Drive route and Google script stay out of the precache manifest.
- **Save back** is a separate, later decision (`files.update` or a new file); not in this ticket.

## Your side (outside the repo)

1. Google Cloud project, OAuth consent screen, `drive.file` scope (non-sensitive, no heavy review).
2. Drive API, Drive UI integration: Open URL `https://pdkef.com/drive/`, MIME `application/pdf`.
3. Workspace Marketplace SDK listing and Google's review.

## Acceptance

- The invariant wording above approved or edited by Shlomi, then written into CLAUDE.md first.
- Right-click a PDF in Drive, Open with PDkef, and it opens in the Open with chooser on a production
  build, signed in and signed out.
- The exception exists on `/drive/` only; `test:csp`, `test:seo`, `test:precache-budget` green.

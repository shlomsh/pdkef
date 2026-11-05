---
id: "MERGE-26"
title: "Save to Drive: an optional, explicit copy of a finished PDF into the person's own Drive"
status: "open"
priority: "P3"
epic: "polish"
horizon: "next"
depends_on: ["MERGE-25", "DRIVE-03"]
---

# MERGE-26 · Save to Drive

*Revised 2026-11-05, approved: the invariant wording is in CLAUDE.md. The token is kept on the device
(`/drive/` only), not in memory, and Save opens `/drive/` in a new tab that closes itself, so the finish
row can say "Saved to Google Drive". The sections below stand otherwise; "Nothing persists" and the
confirm step are replaced by that. Fewest taps wins.*

*Drafted 2026-11-03.* MERGE-25 brought a file in from Drive. This is the way back out: a finished PDF
copied into the person's own Drive, only when they ask. It is a convenience, never a requirement, and
every tool works exactly the same if nobody ever touches it.

## The one thing that changes

Saving is the first time file bytes leave the device, even if only to the person's own Drive at their
tap. CLAUDE.md's first invariant has to name that before anything is built. Suggested wording for
Shlomi to edit:

> ...One exception, MERGE-25 and MERGE-26: the optional Drive app on `/drive/` alone signs in with
> Google (`drive.file`), fetches a file the person opens from Drive, and, only when they tap Save to
> Drive, uploads the finished file to their own Drive. No other page loads a Google script or connects
> to Google.

## Design

- **One Google page.** Tool pages never load a Google script and never connect to Google; their CSP
  backstop stays whole. The Save button does not call Google. It writes the finished file to the
  existing IndexedDB hand-off and navigates to `/drive/` (a save mode, for example `/drive/?save=1`).
- **Where the button lives.** In a tool's done state as a quiet secondary link beside Download, using
  the shared hand-off row from the cross-tool hand-offs rule. Download stays primary. Never on a first
  screen, never a banner, never a prompt. Hidden offline.
- **Confirm step on `/drive/`.** Plain wording, in the site voice: the file name, "This copies it to
  your Google Drive. PDkef keeps no copy.", then one **Continue with Google** tap. The popup must come
  from that tap (mobile Safari).
- **Upload.** `drive.file` allows creating a new file: multipart `files.create` to
  `www.googleapis.com/upload/drive/v3/files`. When the file came from Open with (MERGE-25 state is
  kept for that), also offer "Replace the original", via `files.update`, defaulting to "Save as a new
  copy". Never overwrite without that choice.
- **Nothing persists.** Token in memory only; no stored sign-in, no cookies, no "connected" state. Each
  save is a fresh consent. The hand-off record is deleted as soon as the upload ends or the person
  leaves.
- **Failure states.** Denied, popup blocked, offline, quota full, upload interrupted: each says what
  happened and offers Download as the way out. The file is never lost because a save failed.
- **Pure parts apart from the UX.** A request-builder (name, mime, multipart body) and a result mapper
  as plain functions with unit tests, like `driveClient.ts`.

## Scope

- `src/site-lib/drive/driveUpload.ts` (+ test), save mode in `DriveOpen.tsx` (or its own island if it
  reads better), the Save to Drive link in the shared done-state hand-off row.
- CSP: `/drive/` already allows `www.googleapis.com`; check the upload host needs nothing more, and keep
  `test:csp` asserting the Google origins appear on `/drive/` only.
- Privacy page: extend the "Opening a file from Google Drive" section to cover saving, in the same
  voice.
- Precache: no change (`/drive/` stays out).

## Acceptance

- The invariant wording approved by Shlomi and written into CLAUDE.md first.
- From a tool's done state, Save to Drive uploads the file to the signed-in person's Drive on a
  production build, on desktop Chrome and on an iPhone.
- Download still works and is still primary; with the Drive path never touched nothing about the tools
  changes, and no tool page requests anything from Google (`test:csp` proves it).
- A failed save never loses the result.
- `test:csp`, `test:seo`, `test:precache-budget` green.

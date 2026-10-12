---
id: "MEM-14"
title: "Opening a second file in Sign gives the first file's recent tile the second file's thumbnail"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-14 · Opening a second file in Sign gives the first file's recent tile the second file's thumbnail

*Filed 2026-10-12*, found during SITE-42 QA. Pre-existing, not caused by SITE-42.

## Reproduction

Open `qa-alpha.pdf` (a copy of `public/images/redaction-guide/sample.pdf`) in `/sign/` with Sign's own
picker, then open `qa-bravo.pdf` (a copy of `src/lib/__fixtures__/num-3.pdf`) through the picker or
Replace file, then go to the home page. Both recent tiles show the second file's "3" page. Seen in
Chromium and WebKit on a production build; on the iOS Simulator it corrected itself after re-opening
the first file.

## Cause

`useDraftPersistence.js`'s preview effect, once page 1 of the new file is rendered, starts
`cacheRecentFile(tool, { ...newFile, preview })` without waiting for it, then calls
`attachDraftPreview(tool, preview)` straight away. `attachDraftPreview` writes to whatever entry the
tool's current pointer names, and `cacheRecentFile` only moves that pointer after it has hashed the
bytes and written IndexedDB. So the pointer still names the previous file, and the previous file's
row gets the new file's preview.

## Outcome

Each recent row keeps the preview of its own file: the preview effect writes its preview only through
`cacheRecentFile`, which keys it by the file's content hash, never through the pointer.

## Acceptance

- A unit test against the real store (open A, then B, in one mounted hook) fails before the fix and
  passes after it.
- On a production build (`npm run build` + preview on a non-4173 port), the reproduction above leaves
  two tiles with two different thumbnails, in Chromium and WebKit.

---
id: "RED-63"
title: "Redact: saved-file check should fall back quietly when the saved file is unreadable on iOS"
status: "blocked"
priority: "P2"
epic: "redact"
depends_on: []
waiting_on: "An iPhone check, and a day of production reads with no check_saved_file NotReadableError"
---

# RED-63 · Redact: saved-file check should fall back quietly when the saved file is unreadable on iOS

Filed 2026-10-11 from the daily error read.

## What happened

Two reports on 2026-10-09, `redact` / `NotReadableError` / step `check_saved_file`, build 08e10cf: one on iOS 18, one on iOS 26 (a third-party browser is not ruled out). Both came after export and download (actions end `export, download`). Resolved to `src/tools/redact/useSavedFileCheck.ts:76`: `await saved.arrayBuffer()` rejects. Inferred, not read: iOS invalidates the saved Blob or File once the download has started, so the check reads a handle that is no longer readable.

## Why it is a ticket

`NotReadableError` on a Blob we just made is the environment, not our code (`.claude/rules/tools-and-shell.md`, "Catching errors"), yet the catch at `:90-98` reports it and shows the `failed` state in `SavedFileCheck.tsx`. The person sees a failed check on a file that exported fine.

## Brief
- Reproduce on a real iPhone (the check is gated behind a real download) or find the iOS rule that invalidates the Blob; read `saved` bytes before the download starts if that is the cause (the export already holds them).
- Treat a `NotReadableError` from `saved.arrayBuffer()` / `originalFile.arrayBuffer()` as the environment: no `reportError`, a `// expected: <why>` comment, and the quietest state that is true (no "failed" line if the check simply did not run). Keep reporting errors from `runSavedFileCheck` itself.
- Add the `docs/error-known-items.json` entry in the same change (DEBT-36), matching area `redact`, step `check_saved_file`, slug `redact`.

## Progress

The fix landed in `4088b5b2` (`useSavedFileCheck.ts` treats `NotReadableError` as the environment; test in
`useSavedFileCheck.test.tsx`; registry entry `fixedIn`). The iPhone box is the open one.

## Acceptance
- Unit test: an `arrayBuffer()` that rejects with `NotReadableError` sends no report and does not show the failed state; seen failing first.
- On an iPhone: export, download, and the check shows its result or nothing, never a failure.

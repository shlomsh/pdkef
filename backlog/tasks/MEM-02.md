---
id: "MEM-02"
title: "Tools on the memory space: Sign, Redact and Merge save into the entry and resume from the pointer"
status: "in_progress"
priority: "P1"
epic: "one-memory-space"
phase: "near-term"
depends_on: ["MEM-01"]
legacy_state: "Open"
---

# MEM-02 · Tools on the memory space: Sign, Redact and Merge save into the entry and resume from the pointer

*Filed 2026-09-15.* The tool-side half of MEM-01.

## Scope

- `useDraftPersistence.js` (Sign, Redact) and `useMergeDraft.ts` write work into the current entry
  and set the per-tool pointer; the mount-time restore follows the pointer. `beforeRestore` still
  claims a pending hand-off first (sequenced, not raced). `clearDraft` becomes "clear this tool's work
  on this entry and drop the pointer": the file stays in recents as a source, its work is gone. The
  "Draft saved" chip keeps its states (`idle` / `pending` / `saved` / `error` / `conflict`); its copy
  may say "Saved" rather than "Draft saved" - decide with the shell's voice, no new state.
- The same file in two tools: opening a PDF in Redact that already has Sign work loads the Redact
  work only; Sign's stays on the entry untouched.
- Merge's multi-file entry is a first-class recent (hash over the set), not the MERGE-13 prepend in
  `FileDropzone.readHomeRecents`. Its tile keeps the first file's preview and page count.
- Download or share never clears anything (already true; keep the test that proves it).

## Acceptance

- Playwright (one per tool, in the tool's `e2e/`): open a file, edit, close the page, reopen the tool
  page directly, the work is back. Open a second file from the home page, then reopen the first from
  its tile: its work is back too, nothing was overwritten.
- Unit tests for the hook changes in place of the per-tool ones; `check:fast` green.

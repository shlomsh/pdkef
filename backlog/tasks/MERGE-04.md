---
id: "MERGE-04"
title: "Name the file that failed to merge and offer to merge the rest"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MERGE-04 · Name the file that failed to merge and offer to merge the rest

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

`mergePdfs` in `src/lib/merge.js` loads and copies every source inside one loop, and the island wraps
the whole call in one `try/catch`. The message on failure is "A file may be damaged or
password-protected - remove it and try again." With nine files in the list the person has to guess
which one. Encrypted files load under `ignoreEncryption: true` and only fail later, at
`copyPages`, so "damaged" is often the wrong word too.

**Change.** Load each source in its own `try`; on failure, reject with the file's index and a reason
(`encrypted` when `PDFDocument.load` reports encryption, otherwise `unreadable`). The island shows
which file failed, in the file's own row as well as in the error block, and the error offers one
action: "Remove it and merge the rest". For an encrypted file the message says the honest thing and
links to `/unlock/`, where the password can be removed on device first.

**Acceptance.**

- A set with one unreadable file produces an error that names that file; the offered action removes it
  and merges the remaining files without re-adding anything.
- An encrypted file is reported as encrypted, not damaged, with the Unlock link.
- Unit tests in `merge.test.js` for both reasons; the messages live in `toolMessages.ts` so `/he/merge/`
  can carry them.

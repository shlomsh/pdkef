---
id: "RED-69"
title: "Redact: the check after saving asks for a reload when PDkef was updated under it"
status: "done"
priority: "P3"
epic: "redact"
depends_on: []
---

# RED-69 · Redact: the check after saving asks for a reload when PDkef was updated under it

Filed 2026-10-23 from the daily error read; the RED-67 follow-up.

## What happened

One report on 2026-10-22, `redact` / `TypeError` / step `check_saved_file`, iOS 27 Safari, build
5acf929. Resolved to `src/tools/redact/useSavedFileCheck.ts:93`, the lazy
`import('./check/runCheck.ts')`; the drop record's cause was `module_load`. The tab outlived a deploy.
The download had already worked, and the check showed its plain "could not check" line.

## Outcome

- When the check's code cannot load (`dropCause(err) === 'module_load'`), the check says "PDkef was
  updated while this page was open. Reload the page to check the saved file. Your edits are kept.",
  as RED-67 does for export. The report still travels, so MEM-12 can size how often tabs outlive a
  deploy.
- `docs/error-known-items.json` knows the check case, `open`, beside RED-67's export case.

## Progress

Fixed in `dc907fae` (tests first: `useSavedFileCheck.test.tsx` and `SavedFileCheck.test.tsx`, seen
failing). Registry entry `RED-69` is `open`, like RED-67, because tabs can still outlive a deploy.

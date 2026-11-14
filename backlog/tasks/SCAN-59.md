---
id: "SCAN-59"
title: "A PDF Scan cannot read says why, and every such file is named"
status: "done"
priority: "P3"
epic: "scan-next"
depends_on: []
---

# SCAN-59 · The skipped PDF notice

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`.

## Outcome

- A PDF that cannot be opened gets a true reason. `skippedOne` says only JPG and PNG can be scanned, and Scan takes PDFs.
- Two failing PDFs are both named. Each `skipped` call replaces `rejectedFiles` today, so only the last one shows.

## Done, 2026-11-14

A PDF Scan cannot open says "could not be opened, so it was skipped", on its own line beside the photo-type notice, and
every such PDF is named (`addSkipped` adds to the list instead of replacing it). The wording covers a protected PDF too,
so no Unlock hand-off was added. Tests seen failing first in `ScanSkippedNotice.test.tsx` and `useScanPdfPages.test.tsx`.

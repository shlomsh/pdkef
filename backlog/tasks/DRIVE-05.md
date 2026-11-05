---
id: "DRIVE-05"
title: "Save to Google Drive reaches the rest of the tools, if the pilot numbers say so"
status: "open"
priority: "P2"
epic: "polish"
horizon: "next"
order: 5
depends_on: ["MERGE-26"]
---

# DRIVE-05 · The one-offs

*Revised 2026-11-05: Save is a pilot in Highlight and Redact (MERGE-26). Whether it goes wider, and
whether it shows to people not yet connected, is decided from the pilot's numbers. The wiring for the
shared finish row and phone strip was built and then taken out for the pilot; it is a
small change: `useSaveToDrive` plus `SaveToDriveButton` in `FinishRow` and `PhoneFinish`. The several-file
folder path already exists in `driveUpload.ts`.*

Sign, Redact and Highlight build on tap (`EditorExportActions`, `RedactDone`), Scan's phone table has no
`PhoneFinish`, and pdf-to-image and compress-image batches make several files, which go into one new
folder named after the job.

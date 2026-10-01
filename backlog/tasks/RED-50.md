---
id: "RED-50"
title: "A download that fails after the file is made says so, not \"Saved\""
status: "done"
priority: "P3"
epic: "redact"
depends_on: []
---

# RED-50 · A download that fails after the file is made says so, not "Saved"

*Found 2026-10-01 during SNG-08.* The export keeps the saved bytes (for the saved-file check and Compress it
· Sign it) before it hands them to the download. If the download itself throws, the finish row shows
"Saved redacted_x.pdf" next to the export error. SNG-08 kept that order (`EXPORT_SAVED` then
`EXPORT_DELIVERED`) so its migration changed no behaviour.

## Acceptance
- A thrown download leaves the finish row on the error with a way to try again, and does not say the file was saved.

## Result

`EXPORT_FAILED` also clears the kept export, so a download that throws leaves the finish row on "The download stopped." with no "Saved" line, and Download works again. No share-prepared copy exists at that point (`prepare()` runs only before delivery), so nothing else needs clearing. Tested in the reducer and in the island, including a retry that completes. (a3e97654)

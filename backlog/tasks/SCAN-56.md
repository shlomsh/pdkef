---
id: "SCAN-56"
title: "Clear all ends a PDF import, a waiting PDF page is not called unreadable, a late failure cannot block the PDF"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-56 · Three bugs from the Scan review

*Opened 2026-11-05* from a read-only review of all of Scan at `b7fd7e91`. Each was traced in the code, none seen on a device.

## Outcome

- Clear all stops a PDF import: no page arrives after it. Removing the only page so far leaves the import running.
- A PDF page still waiting for its preview says it is being read and keeps its corner controls. Only a page in
  `failedIds` says it could not be read.
- A page that is removed while it is processed cannot hold back the Download if that run fails.
- A page still being read goes at once when removed, with no Undo, so Undo cannot bring back a page whose reading was missed.

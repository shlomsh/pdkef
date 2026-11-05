---
id: "SCAN-59"
title: "A PDF Scan cannot read says why, and every such file is named"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: []
needs: "The wording for a password-protected PDF, or a yes to sending it through Unlock"
---

# SCAN-59 · The skipped PDF notice

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`.

## Outcome

- A PDF that cannot be opened gets a true reason. `skippedOne` says only JPG and PNG can be scanned, and Scan takes PDFs.
- Two failing PDFs are both named. Each `skipped` call replaces `rejectedFiles` today, so only the last one shows.

---
id: "SCAN-18"
title: "Scan remembers the scan in progress, and it shows in Recents"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 2
depends_on: []
---

# SCAN-18 · Scan remembers the scan in progress

*Opened 2026-11-04.* Shlomi: Scan to PDF does not keep its work. After a crash, a closed tab or a closed
browser, the pages are gone, and the scan is not in the home page's recent documents.

Every other tool that holds work keeps it in the one on-device memory space (`src/lib/drafts/draftStore.ts`,
MEM-01). Scan never joined it.

## Outcome

A scan in progress is saved on the device as it changes: the photos, each page's corners (when the person set
them), look and turns, the paper, the size limit and the name. Opening Scan to PDF again, or its tile in the
home page's Recents, brings it back as it was. A scan is one Recents row while it grows: each save replaces the
row the session already had, so taking ten photos does not push five other documents out of Recents.

## Acceptance

- [x] Reloading the page restores the pages, their corners, looks and turns, and the settings.
- [x] The scan appears in the home page's Recents with a thumbnail of page 1 and its page count.
- [x] Adding pages one at a time leaves one Recents row for the scan, not one per page.
- [x] Clear all forgets the scan's work; a hand-off from Image to PDF starts a new scan, not an append.
- [x] A quiet status line says the scan is saved, or that it could not be.

Verified 2026-11-04 on a production build in Chromium (desktop): save, reload, the Recents tile with its
page-1 picture and page count, reopening from Recents, and Clear all after a restore showing the empty state.
Still to check on the iPhone: a scan taken with the live camera survives the app being closed.

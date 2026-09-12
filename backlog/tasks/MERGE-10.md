---
id: "MERGE-10"
title: "Add more documents while the assembled pages are on screen"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-08"]
legacy_state: "Open"
---

# MERGE-10 · Add more documents while the assembled pages are on screen

*Filed 2026-09-13* from the Merge review; Shlomi's ask: adding docs during preview.

## Scope and acceptance

Adding files must never mean leaving the assembled view or losing page edits. Four routes in, all
landing in the current arrangement:

- **Add files** in the shell (already there) appends at the end and scrolls the strip to the new
  pages.
- **Drop onto the strip** at a position inserts the new file's pages there; drop onto the file list
  inserts between files (MERGE-07's insertion line).
- **Paste** (`Cmd`/`Ctrl+V`) with files on the clipboard adds them; the `paste` handler lives in
  `BasePdfTool.receiveFiles` so every tool gets it.
- **Drop a folder** adds its PDFs sorted by name with the numeric collator `sort.js` already uses.

Page edits already made (MERGE-09) are kept; a new file arrives with all pages, unrotated. The
duplicate nudge from MERGE-07 applies on every route. The pre-merge of MERGE-12 restarts.

**Acceptance.**

- Each route is covered by a unit test on the receive path; the strip drop is one Playwright check.
- Adding a file after rotating and skipping pages leaves those edits intact.
- Nothing about this is visible on the SEO surface; `test:weight` unchanged.

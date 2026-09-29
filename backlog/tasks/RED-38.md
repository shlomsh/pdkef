---
id: "RED-38"
title: "Find: Cover all waits for every page, one Find control, 44px targets"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-38 · Find: Cover all waits for every page, one Find control, 44px targets

*UX review 2026-09-29.*

- "Cover all" pressed while pages are still being read covers every match in the document once reading
  finishes (or waits, showing it is reading), never only the pages read so far.
- The kinds menu inside the bar is no longer also called "Find" (it becomes "Kinds").
- Every Find control is a 44px target, the preset chip's clear included.
- Escape in the Find field closes Find only, and focus returns to the toolbar's Find button.

## Acceptance

- A 20-page file: Find a term on every page, press Cover all during reading: every page is covered.

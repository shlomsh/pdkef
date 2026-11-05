---
id: "SCAN-62"
title: "Measure Scan's memory and main thread on a long job"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "later"
depends_on: []
---

# SCAN-62 · A 40-page job on a phone

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`. All three are unmeasured, so this ticket starts with
numbers from 40 photos and from a long PDF, and fixes only what the numbers show.

## Outcome

Each of these has a measured answer, and a fix where it hurts:

- **Draft bytes.** `scanDraftSession.ts` keeps every photo's bytes in memory and rewrites the whole entry on each edit.
  Pages from one PDF sheet store the file once per page. Past 200 MB (`MERGE_DRAFT_MAX_BYTES`) `saveDraft` returns false
  and the person sees the "not saved" alert.
- **Cached builds.** `scanWork.ts` keeps up to 8 builds, each with every page's blob and URL. Take a heap snapshot after
  eight setting changes on 30 pages.
- **The size-limit search.** `encodePages` runs on the main thread inside `work.enqueue`, for up to `MAX_SEARCH_MS`
  (20 s). New photos and corner edits wait behind it.

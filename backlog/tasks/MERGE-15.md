---
id: "MERGE-15"
title: "Spike: a bookmark per source file in the merged PDF"
status: "open"
priority: "P3"
epic: "merge-tool"
phase: "optional"
depends_on: ["MERGE-09"]
legacy_state: "Open"
---

# MERGE-15 · Spike: a bookmark per source file in the merged PDF

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

None of the leaders writes an outline into the merged file. A bookmark per source file, named after the
file and pointing at its first page, makes a 200-page merge navigable in every viewer and costs the
person nothing. It is a small, true differentiator that fits the voice: useful, not loud.

`@cantoo/pdf-lib` has no high-level outline API, so this is low-level `/Outlines` objects, and it is a
spike first: two days to prove a correct outline in Preview, Acrobat, Chrome and iOS, with skipped
pages and cross-file reordering (MERGE-09) accounted for (a bookmark points at the file's first
*exported* page; a file with every page skipped gets none). Any new dependency goes through the
licence allowlist (`npm run test:licenses`).

**Acceptance of the spike.** A written go or no-go in this ticket with the viewer matrix. If go, the
build ticket is filed separately with the option on by default and off under Options (MERGE-11).

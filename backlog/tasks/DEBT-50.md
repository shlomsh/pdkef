---
id: "DEBT-50"
title: "Edit Pages: replacing a file no longer throws from Sortable.destroy"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-50 · Edit Pages: replacing a file no longer throws from Sortable.destroy

*Filed 2026-10-14 from the daily error read.* One uncaught TypeError on 2026-10-13 (chromium-154, build
c89b34b, `/edit-pdf/`, after add_files then replace_file). Mapped to source: `sortableRef.current?.destroy()`
at `src/tools/edit-pages/PdfEditPagesTool.tsx:61` throws in sortablejs at `el[expando] = null`, so the
stored Sortable's `el` is gone (the grid node was replaced) when the effect re-runs.

## Acceptance

- The Sortable instance is destroyed in the effect's cleanup (or guarded) so a replaced grid never reaches
  `destroy()` with a missing element.
- A unit test replaces the file and re-renders without an uncaught error.

## Outcome
Shipped with the fix; the daily read confirms no new report from a build containing it.

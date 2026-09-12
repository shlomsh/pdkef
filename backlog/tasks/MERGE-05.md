---
id: "MERGE-05"
title: "The subhead promises page reordering the tool does not do yet"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MERGE-05 · The subhead promises page reordering the tool does not do yet

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

The `merge` entry's `subhead` in `src/data/tools.js` reads "Combine multiple PDFs into a single
document, reorder pages by drag-and-drop, and optionally add page numbers before you export." The tool
reorders files. It is the most visible line after the H1 and the one place `/merge/` overclaims, which
is the thing SEO-16 warns a commodity tool cannot afford.

Two honest options: say "reorder files" now and change it back when MERGE-09 ships page-level
reordering, or hold this ticket until MERGE-09 lands. Say "files" now: MERGE-09 is weeks away and the
line is read today.

**Acceptance.**

- `subhead` (and the `steps` text if it drifts the same way) describes what the tool does.
- `/he/merge/`'s `sourceHash` recomputed as SEO-35 did, Hebrew wording reviewed by Shlomi on the
  deployed site, `reviewNotes` dated.
- `npm run test:seo` green, single `<h1>`, no indexing request (`/merge/` stays the SEO-28 control).
- When MERGE-09 ships, this line is revisited in that ticket's acceptance, not here.

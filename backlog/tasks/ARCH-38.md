---
id: "ARCH-38"
title: "Adding a tool edits one registry, and hand-offs go through one function"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 7
depends_on: []
---

# ARCH-38 · Adding a tool edits one registry, and hand-offs go through one function

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 4).

## Why

A new tool means editing about nine lists: `ANALYTICS_TOOLS`, `RATING_TOOLS`, `PAGE_SLUGS`,
`CAPABILITIES`, `LOCALIZED_TOOL_ISLANDS`, `toolMessageTables`, `RETURN_TO`, and `HANDOFF_HREFS`,
declared separately in Split, PDF to Image, Edit Pages, Merge and Scan. "Save the hand-off, then
navigate" is copied 7 times. `ToolPageLayout` and `ToolHero` special-case `sign`, `redact` and
`merge` by slug, and output names are built through seven copies of a base-name regex.

## Outcome

- One dependency-free `src/lib/toolIds.ts` (or the place the boundaries doc names) holds every tool's
  id, slug, href and capabilities; the nine lists derive from it.
- One `sendHandoff` (and hook) does save-then-navigate for every caller.
- Layout differences per tool come from the registry's data, not slug comparisons.
- One output-name helper builds every tool's file name. Which naming convention it uses is Shlomi's
  call (see the record's open question); this ticket keeps today's names until he decides.

## Acceptance

- [ ] A unit test fails if a tool in `src/data/tools.js` is missing from the registry, or vice versa.
- [ ] No `HANDOFF_HREFS` constant and no `saveHandoff(` call outside `sendHandoff` remain.
- [ ] Every tool's output names are byte-identical to today's, pinned by one table-driven test.

---
id: "ARCH-38"
title: "Adding a tool edits one registry, and hand-offs go through one function"
status: "in_progress"
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

- [x] A unit test fails if a tool in `src/data/tools.js` is missing from the registry, or vice versa.
- [x] No `HANDOFF_HREFS` constant and no `saveHandoff(` call outside `sendHandoff` remain.
- [x] Every tool's output names are byte-identical to today's, pinned by one table-driven test.

## Progress

2026-10-26, branch `un-arch-38`, four commits.

1. **Registry.** `src/lib/toolIds.ts` (no imports) lists all 15 pages with slug, href, island id and the flags the lists needed. `ANALYTICS_TOOLS`, `RATING_TOOLS`, the hand-off `PAGE_SLUGS`, the home dropzone's `CAPABILITIES`, `RETURN_TO` and the localized-island slugs derive from it. `src/test/cross-tool/toolIds.test.ts` fails when a page is in `src/data/tools.js` and not in the registry, or the reverse. Left for ARCH-35: `toolMessageTables`, and `LOCALIZED_TOOL_ISLANDS` in `src/i18n/localizedTools.ts` (the test pins it equal to the registry's `LOCALIZED_ISLAND_SLUGS`; swap the declaration for the import when that file is free).
2. **sendHandoff.** `src/lib/sendHandoff.ts` is the one save-then-navigate; seven callers moved, `HANDOFF_HREFS` is gone (`useDownloadFlow` falls back to the registry page, `hrefs` is an override for a locale edition). `src/test/cross-tool/handoffSingleDoor.test.js` fails on any other `saveHandoff(` call or `HANDOFF_HREFS` table.
3. **Layout flags.** `editorLayout`, `iconTone`, `restoresFileList`, `unlimitedNote` on the registry replace the slug comparisons in `ToolPageLayout.astro` and `ToolHero.astro`, including the hashed pre-paint script (built from the registry, same bytes, same CSP hash). All 52 built HTML files are identical apart from hashed asset names and the build stamp.
4. **Output names.** `src/lib/outputName.ts` builds every tool's name; `src/test/cross-tool/outputNames.test.ts` pins 15 inputs across all tools, written green against the old code first. Four strip modes remain only because the old regexes differed on a bare `.pdf`, `a.` and `.hidden`; they collapse when Shlomi picks a convention.

Not done: `scripts/ratings-read.mjs` still mirrors the rating ids by hand (a script cannot import TS).

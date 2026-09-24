---
id: "ARCH-26"
title: "Rule 9 counts the site once; site-only shell modules move to src/site-lib/"
status: "done"
priority: "P3"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-25"]
---

# ARCH-26 · The site is one consumer

*Filed 2026-09-24* from the independent review of ARCH-25.

## Problem

ARCH-25's ticket defined a consumer as "a tool or the site". The landed rule 9 counts each site file
separately and keeps walking past a site node to its importers, so a module reached through one
layout counts the layout and every page that renders through it
(`scripts/check-module-boundaries.mjs`, `commonLayerConsumers()`). `src/shell/homeWorkspace.ts`,
loaded only by `HomePageLayout.astro`'s `<script src>`, passes as `{HomePageLayout.astro,
index.astro}`: one real use, counted as two. The rules test pins that behaviour
(`scripts/check-module-boundaries.rules.test.mjs`, the `homeWorkspace.ts` case).

## Scope

- Count all site files as one consumer identity, as tools already are one identity each.
- Expected to flag the shell modules only the site uses (the 2026-09-24 audit named
  `FileDropzone.tsx`, `homeWorkspace.ts`, `RecentFiles.tsx`, `sampleDocument.ts`; re-measure). Site-only
  code already has a home, `src/site-lib/` (DEBT-05); move them there, updating layout
  `<script src>` paths. Verify with `npm run build && npm run preview` (CSP, service worker precache)
  and the home-page e2e.
- Update rule 9's wording in `docs/module-boundaries.md` and the checker header.

## Acceptance

- Rule 9 counts the site once, zero violations, no exception list; the moved modules live in
  `src/site-lib/`; the full `ci.yml` chain is green.

## Result (2026-09-25)

- `commonLayerConsumers()` credits every site file (pages, layouts, `.astro` components, i18n, data,
  `src/site-lib/`, `<script src>` targets) to one `SITE_CONSUMER` identity. No exception list.
- The re-measure flagged exactly the four modules the audit named, nothing in `lib` or `editor-ui`.
  `FileDropzone`, `RecentFiles` (each with its CSS Module and test), `homeWorkspace` and
  `sampleDocument` moved from `src/shell/` to `src/site-lib/`; `HomePageLayout.astro`'s import and
  `<script src>` follow them, and so do `.claude/rules/home-page.md`'s paths and the open tickets that
  named them (MOBI-18, DEBT-21).
- The rules test pins site-once counting: two site files are one consumer, a tool plus the site are
  two, and `homeWorkspace.ts` resolves to `{site}`.
- Checker: 0 violations. Full `ci.yml` chain green locally (chromium 206, webkit 27, perf 5, fonts
  133 passed / 2 skipped, export-guards 1 passed / 1 skipped).

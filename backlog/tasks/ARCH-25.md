---
id: "ARCH-25"
title: "Define common: shared code needs two consumers, and the checker says so"
status: "in_progress"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-22"]
---

# ARCH-25 · Common means used by two

*Filed 2026-09-24* from the post-refactor ROI review (see ARCH-22's post-landing check).

## Problem

`docs/module-boundaries.md` says which way imports may point, but never says what earns a module a
place in a common layer (`lib`, `shell`, `editor-ui`, `editor`). In practice "common" is whatever
is not under `src/tools/<tool>/`. The per-module tables in the doc already move single-consumer
modules into their tool, but only by convention. An audit on 2026-09-24 (import scan of 279 prod
files, 930 edges) found 0 rule violations and 0 tool-to-tool edges, and one module that only one
tool uses: `src/editor-ui/SignatureDialog.tsx` (Sign only; the doc still says Sign and Redact share
it). Three other apparent single-consumer modules have a second consumer the scan must count:
`src/lib/maintenanceTelemetry.ts` (Sign + `src/layouts/BaseLayout.astro`), `src/lib/platform.ts`
(Merge + `src/shell/DropzoneEmptyState.tsx` + `src/i18n/toolMessages.ts`),
`src/shell/CompareSlider.tsx` (Compress + `src/components/CompareFigure.astro`). Shell modules
reached only through a layout's `<script src>` (`FileDropzone.tsx`, `homeWorkspace.ts`,
`RecentFiles.tsx`, `sampleDocument.ts`) are consumed by the site and are correctly shell.

The doc's Evidence section still presents ARCH-15's 33-violation snapshot as if current.

## The rule

A module lives in a common layer only when two or more consumers use it, where a consumer is a
tool (`src/tools/<tool>/`) or the site (pages, layouts, `.astro` components, `<script src>`
entries). A module one tool uses lives in that tool's folder; a module nothing uses is deleted.
Which common layer: `editor` headless editing core, `editor-ui` Sign/Redact chrome, `shell` chrome
every tool shares, `lib` framework-free helpers.

## Scope

- Add the rule to `docs/module-boundaries.md` and enforce it in `scripts/check-module-boundaries.mjs`
  (counting `.astro` and `<script src>` consumers so the site counts), red on a single-consumer or
  zero-consumer common module, with tests.
- Move `SignatureDialog.tsx` (and its CSS/test) into `src/tools/sign/`.
- Mark the doc's Evidence section as the ARCH-15 snapshot and correct stale consumer claims.

## Acceptance

- `npm run test:module-boundaries` enforces the rule, green on main, red on a throwaway
  single-consumer module.
- `SignatureDialog` lives in `src/tools/sign/`; `check:fast` and the Sign e2e stay green.

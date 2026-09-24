---
id: "ARCH-25"
title: "Define common: shared code needs two consumers, and the checker says so"
status: "done"
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

## Result

Landed 2026-09-24. Rule 9 covers `lib`, `shell` and `editor-ui` only; `editor` is explicitly out of
scope, stated in both `docs/module-boundaries.md` and the checker's header comment, one sentence of
reason: the editor is a layered core whose adapters serve one tool by design, already governed by
`check-editor-dependency-directions.mjs` and, for field detection, by ARCH-24. The `RULE9_EXCEPTIONS`
Map (27 entries, 26 of them under `src/editor/`) was deleted entirely, along with its lookup and the
"not in RULE9_EXCEPTIONS" message text - no exception list of any kind remains.

Two files moved out of the common layers into the one tool that actually uses them:
`SignatureDialog.tsx` (Sign only) and `useCoarsePointer.ts` (also Sign only, verified by grep of its
production importers before moving; it landed flat in `src/tools/sign/`, matching that folder's own
convention of flat hook files rather than a `hooks/` subfolder). `CompareSlider.tsx` had already moved
into `src/tools/compress/` earlier in this same session, once `CompareFigure.astro` stopped importing
it and left it with a single consumer; `docs/module-boundaries.md`'s own evidence section records that
move under the `src/shell/` heading.

`scripts/check-module-boundaries.rules.test.mjs` lost the exception-related test title/wording and
gained one proving an `editor` module with a single real consumer
(`src/editor/adapters/pdf/sign.js`, consumed only by `tool:sign`) is never flagged, because
`commonLayerConsumerViolations()` no longer walks `editor` files at all - not because of a per-file
allowance. The red fixture cases for `lib`/`shell`/`editor-ui` single- and zero-consumer modules were
kept unchanged.

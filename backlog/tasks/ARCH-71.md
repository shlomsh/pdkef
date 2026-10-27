---
id: "ARCH-71"
title: "Message registries and content helpers are typed, removing any and double casts"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-71 · Message registries and content helpers are typed, removing any and double casts

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- Six localized pages pass `messages={page.toolMessages as any}` (`src/pages/[locale]/merge.astro:14` and five more).
- Three identical `astro:content` casts through `unknown` (`i18n/documentation.ts:52`, `localizedHome.ts:75`, `localizedTools.ts:83`), and pdf-lib `embedder` casts in `editor/registry/textPdf.ts:24` and `editor/text/textMetrics.ts:24`.

## Outcome

- The registry returns per-tool message types; one typed wrapper per concern replaces the double casts.

## Acceptance

- [x] No `as any` in `src/pages/[locale]/`; no `as unknown as` outside the wrappers.

## Done (2026-10-27)

The tool-message registry returns per-tool types, so no `as any` remains in src/pages/[locale]/. One astro:content wrapper (src/i18n/contentEntries.ts) and one pdf-lib embedder accessor (textMetrics.ts) replace the double casts.

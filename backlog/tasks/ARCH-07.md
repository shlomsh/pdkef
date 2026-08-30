---
id: "ARCH-07"
title: "Consolidate documentation locale routing under src/i18n/"
status: "done"
priority: "P3"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# ARCH-07 · Consolidate documentation locale routing under src/i18n/

## Scope and acceptance

**Consolidate documentation locale routing under `src/i18n/`.** Localized routes, eight gated Hebrew drafts, locale resolution, and the article-level language selector now exist. Tool pages expose documentation by topic only; country-based language discovery was deliberately removed because it did not reflect what an individual reader speaks. The selector appears only on an article with a real equivalent. All eight Hebrew pages remain `draft`, gated behind `PDKEF_DOCS_PREVIEW=1`, `noindex, follow`, self-canonical, and absent from the production sitemap. The consolidation must preserve that boundary and must not couple static documentation routing to PDF editor state.

**Completed 2026-08-30.** Locale registry/resolution and tests now live under `src/i18n/`; production and preview route/sitemap boundaries remain intact, and the i18n layer has no editor-state imports.

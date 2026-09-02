---
id: "ARCH-08"
title: "Make documentation shell messages data-driven per locale"
status: "open"
priority: "P2"
epic: "editor-architecture"
phase: "near-term"
depends_on: ["ARCH-07"]
legacy_state: "Open — raised 2026-09-02 from localization re-audit"
---

# ARCH-08 · Make documentation shell messages data-driven per locale

## Scope and acceptance

**The documentation router scales; its shell copy does not yet.**
`src/i18n/documentationLocales.ts` registers twelve editions, but Hebrew shell labels
are hard-coded twice: in `src/pages/[locale]/[contentPage].astro:30-34` and
`src/layouts/ContentPageLayout.astro:59-67`. Every other registered locale falls back to
English labels if content is added, and there is no typed completeness check for the
AppBar, language selector, FAQ, related-guide, preview, social-alt, and footer strings.
Create one build-time, typed message catalog owned by `src/i18n/`; resolve it by locale
in the route and pass the result through existing components. A locale with a
publishable page must provide every required shell key, while the English editor notice
and English control labels remain explicitly English per product policy. Keep the
documentation pages static and add LTR and RTL tests proving missing keys fail before a
page can publish.

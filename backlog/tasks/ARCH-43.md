---
id: "ARCH-43"
title: "The site reads font tables from a data module, not from the editor core"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 1
depends_on: []
---

# ARCH-43 · The site reads font tables from a data module, not from the editor core

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Layering and dependency direction. Structure only: no behaviour change.

## Why

- `src/pages/licenses.astro` and `src/site-lib/precachePolicy.js` import `src/editor/text/fontManifest.ts` (and licenses also `fontLicenses.ts`). No boundary rule describes a site to editor edge, so the headless core is a de facto public API for build-time site code.

## Outcome

- The font manifest and license tables live where both the editor and the site may import them, or a boundary rule names the edge explicitly.

## Acceptance

- [ ] `check-module-boundaries` covers site to editor edges; no unclassified edge remains.

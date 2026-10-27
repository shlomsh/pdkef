---
id: "ARCH-47"
title: "signHelpers.js splits into text direction, text layout and image tint modules"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-47 · signHelpers.js splits into text direction, text layout and image tint modules

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- `src/editor/text/signHelpers.js:17-137` has ten exports across text direction (`strongTextDirection`), layout (`fieldTextInset`, `textElementLayout`) and graphics (`hexToRgbFractions`, `tintImageDataUrl`), in a file named after one tool, with 16 importers.

## Outcome

- Three modules named for their concern; importers updated; `signHelpers.js` deleted.

## Acceptance

- [x] No import of `signHelpers` remains; unit tests move with their functions.

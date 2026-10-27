---
id: "ARCH-88"
title: "Shadows and scrims are tokens, and color literals outside :root fail a check"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 20
depends_on: ["ARCH-76"]
---

# ARCH-88 · Shadows and scrims are tokens, and color literals outside :root fail a check

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Styling architecture. Structure only: no behaviour change.

## Why

- About 28 `rgba()`/`rgb()` shadows and scrims sit in 14 CSS Modules, with repeats: the same `rgba(0,0,0,.4)` scrim in `sign/components/FontSheet.module.css:24` and `redact/details/Details.module.css:60`; 7 in `src/editor-ui/EditorControls.module.css`.
- "Colors come from :root tokens" is prose only.

## Outcome

- `--scrim`, `--shadow-pop` and similar tokens in `global.css`; a `check-color-literals` script allowlisting `:root`, flag colors and user presets.

## Acceptance

- [ ] The check runs in `test:css`; module literals are replaced by tokens.

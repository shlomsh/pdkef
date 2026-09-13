---
id: "QUAL-04"
title: "--color-border-strong is 2.07:1 on white and 1.80:1 on the primary tint, under the 3:1 boundary guideline"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "later"
depends_on: []
legacy_state: "Open"
---

# QUAL-04 · `--color-border-strong` is 2.07:1 on white and 1.80:1 on the primary tint, under the 3:1 boundary guideline

*Filed 2026-09-13* while reviewing the Merge rail (MERGE-19).

## What is wrong

`global.css` has two border tokens: `--color-border` #d8e8ec (1.26:1 on white, 1.09:1 on
`--color-primary-tint`) and `--color-border-strong` #8dbcc7 (2.07:1 on white, 1.80:1 on the tint).
WCAG 1.4.11 asks 3:1 for the boundary of a control against its adjacent ground. Neither token
reaches it anywhere, and on the tinted surfaces the tool rails use (`--color-primary-tint`,
`--color-primary-soft`) the weak token disappears entirely.

This is a token decision, not a per-component one: darkening `--color-border-strong` changes every
bordered control in the app, so it is filed here rather than fixed inside the Merge epic.

## What to do

Measure first (the arithmetic, then a real browser): on the tint, `color-mix(in srgb,
var(--color-primary) 70%, var(--color-primary-tint))` gives 2.51:1 and 80% gives roughly 3:1; on
white the same mixes land near 2.9:1 and 3.4:1. Pick the lightest value that reaches 3:1 on the
tint, apply it to `--color-border-strong` only (`--color-border` stays the hairline for dividers
and table rules, which are not controls), and walk every consumer of the strong token at 1280 and
375 for anything that now reads heavier than intended. Both themes.

**Acceptance.**

- `--color-border-strong` measures at least 3:1 against `--color-surface`, `--color-bg` and
  `--color-primary-tint` in the light theme, and the equivalent in the dark theme.
- No component reaches for a literal to compensate; the ratchets in `npm run test:css` unchanged.
- Before and after screenshots of one tool rail, one dialog footer and the home page dock.

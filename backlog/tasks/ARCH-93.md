---
id: "ARCH-93"
title: "docs/module-boundaries.md holds only current rules, generated from or checked against the script"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 13
depends_on: []
---

# ARCH-93 · docs/module-boundaries.md holds only current rules, generated from or checked against the script

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- The file is 517 lines: about 140 of live rules, then a 360-line ARCH-15 snapshot marked "not current" at line 154. 16 of 31 module rows there name files that moved; all 9 missing paths cited across the guidance are in this file.
- The ten rules exist in three hand-synced copies (`docs/module-boundaries.md:15-38`, `scripts/check-module-boundaries.mjs:22-60`, CLAUDE.md), and the doc says "keep in sync by hand".

## Outcome

- The snapshot moves to `docs/archive/`; the rule list is generated from the script, or a test checks that the doc and script agree.

## Acceptance

- [ ] `docs/module-boundaries.md` cites no missing path; a renamed rule in the script fails the doc check.

---
id: "ARCH-50"
title: "File and function length are ratchets that only shrink"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: ["ARCH-76"]
---

# ARCH-50 · File and function length are ratchets that only shrink

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- No ESLint, Biome or size check exists. 13 non-test files exceed 800 lines, 44 exceed 400, and 25 functions exceed 300 lines.
- The size problem is concentrated (median file 80 lines, p90 337), so a ratchet with a per-file allowlist holds it without churn.

## Outcome

- A check records each oversized file and function at its current length and fails when one grows or a new one crosses the threshold (800 lines per file, 300 per function).

## Acceptance

- [x] Growing a recorded file fails CI; shrinking it passes and lowers the record.

## Done (2026-10-27)

scripts/check-size-ratchet.mjs records 13 files over 800 lines (.astro included) and 25 functions over 300 in ratchet-limits.json; growth fails, a clean local run lowers the record, a failing run writes nothing. Its first integrated run caught check-module-boundaries.mjs at 816 lines, which was split.

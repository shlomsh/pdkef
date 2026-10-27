---
id: "ARCH-54"
title: "Scan moves its ref-held state into a typed state module"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 6
depends_on: []
---

# ARCH-54 · Scan moves its ref-held state into a typed state module

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `src/tools/scan/PdfScanTool.tsx:116` is a 728-line component with 21 refs and 15 useState calls, the most ref-heavy island, against 18 supporting modules.

## Outcome

- Refs that encode lifecycle become states in one typed module; refs remain only for DOM handles and true instance values.

## Acceptance

- [ ] The island has fewer than 8 refs; a unit test covers the state module.

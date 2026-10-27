---
id: "ARCH-99"
title: "E2e specs build PDFs and open tools only through e2e/support"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 4
depends_on: []
---

# ARCH-99 · E2e specs build PDFs and open tools only through e2e/support

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- ARCH-77 moved 31 makePdfBuffer and 8 openTool copies into e2e/support, but about 28 specs still build PDFs with local helpers under other names and 146 island waits are written inline.

## Outcome

- Specs build PDFs and wait for islands through e2e/support helpers; test counts unchanged.

## Acceptance

- [ ] No spec defines its own PDF builder or inline island wait; every Playwright project lists the same tests.

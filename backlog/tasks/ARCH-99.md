---
id: "ARCH-99"
title: "E2e specs build PDFs and open tools only through e2e/support"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-99 · E2e specs build PDFs and open tools only through e2e/support

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- ARCH-77 moved 31 makePdfBuffer and 8 openTool copies into e2e/support, but about 28 specs still build PDFs with local helpers under other names and 146 island waits are written inline.

## Outcome

- Specs build PDFs and wait for islands through e2e/support helpers; test counts unchanged.

## Acceptance

- [x] No spec defines its own PDF builder or inline island wait; every Playwright project lists the same tests.

## Closed

Closed 2026-10-27. Specs build PDFs through `e2e/support/pdf.js` (`makePdfBuffer` plus named builders, moved verbatim where byte order mattered) and wait through `waitForIsland`, with `{ single: true }` for the one spec that asserts a single island. `playwright test --list` is 886 tests before and after. Two waits stay as they are by design: `language-acceptance.spec.js` builds its PDF inside the browser, which is what it tests, and the two Compress specs wait for the empty state inside the island, not for hydration. A review caught `waitForIsland` calling itself; fixed and covered by the e2e run.

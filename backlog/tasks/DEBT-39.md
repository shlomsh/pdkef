---
id: "DEBT-39"
title: "PdfRedactTool.test.tsx hangs two tests a run, different ones each time"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-39 · Redact's island tests hang intermittently

*Filed 2026-10-04.* `npx vitest run src/tools/redact/PdfRedactTool.test.tsx` on `origin/main`
(b00eb4cd, 2026-10-03) failed two consecutive runs on an idle machine: each time 2 of 127 tests,
different ones, almost all by hitting the 25s test timeout ("RED-31: holding a box for 250ms peeks
it...", "Undo and Redo are one tap each on the toolbar...", "a picked colour makes the box
custom...", "Unlock it parks the file for Unlock, then navigates there"). One run had a single test
take 969s ("returns to auto once a drawn box commits and the one-shot tool disarms itself"). An hour
earlier the same file passed in a combined run.

## What to do

Find what hangs (a leaked timer, an unresolved promise, state leaking between tests), fix the root
cause, never a raised timeout.

## Acceptance

- [ ] The hanging test(s) and the mechanism are named here, with the evidence.
- [ ] The root cause is fixed; no timeout is raised.
- [ ] The file passes 10 runs in a row, and with `--sequence.shuffle`.

---
id: "DEBT-74"
title: "The 20 second PDF load timeout releases the load it gave up on"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# DEBT-74 · The 20 second PDF load timeout releases the load it gave up on

*Filed 2026-11-08, from the implicit state machine inventory.* In `src/editor/workspace/loadPdf.ts`
the timeout (`:139-145`) moves the load to `error` and bumps `loadIdRef`, but never calls
`controller.cancel()`. The pdf.js loading task and any document it produces are released only by the
`finally` block (`if (!completed) controller.cancel()`, `:190`), which runs only once the awaited
work settles. A load that hangs (the reason for the timeout) keeps its pdf.js worker task and buffers
alive until the next load cancels it through `loadControllerRef`, or for good if the person leaves
the error screen open.

## Acceptance

- The timeout calls `controller.cancel()`, and the cancel path still reports nothing for a rejection
  from a cancelled handle (the existing `// expected:` comments at `:74-77`).
- A unit test with a never-resolving `getDocument` advances fake timers past 20s and asserts the
  loading task's `destroy()` was called.

## Outcome

Done 2026-11-08. The timeout calls `controller.cancel()` after writing the error state; the rejection it causes is dropped by the catch's `isCurrent()` guard. One fake-timer test asserts status 'error', one announcement, `destroy()` once and no `reportError`; before the fix the load never returned.

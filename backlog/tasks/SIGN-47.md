---
id: "SIGN-47"
title: "Placing a new signature from the dialog keeps a locked Sign tool locked"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: []
---

# SIGN-47 · Placing a new signature from the dialog keeps a locked Sign tool locked

*Filed 2026-11-08, from the implicit state machine inventory.* `handleAddSignatureElement` in
`src/tools/sign/hooks/useSignaturePlacement.ts` dispatches a bare
`{ type: 'SET_TOOL', payload: 'signature' }` (`:63`) and then `DISARM_TOOL` (`:70`). A bare
`SET_TOOL` always clears the lock (`toolLocked: tool ? locked : false` in
`src/tools/sign/components/SignToolContext.tsx`), so the following `DISARM_TOOL` disarms. A person
who double-clicked Sign to place several signatures loses the lock as soon as they draw a new
signature in the dialog. Placing by page tap (`useWorkspaceGestures.ts`) only dispatches `DISARM_TOOL`
and keeps the lock, which is the behaviour `editor.md` describes for every tool.

## Acceptance

- The dialog path preserves `toolLocked` (it passes `{ tool: 'signature', locked: state.toolLocked }`,
  or skips `SET_TOOL` when Signature is already armed).
- A unit test locks Signature, adds a new signature through the dialog path, and asserts the tool is
  still armed and locked. The one-shot (unlocked) case still disarms.

## Outcome

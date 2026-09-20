---
id: "UNDO-06"
title: "The change-history dialog goes; Undo and Redo are the whole model"
status: "in_progress"
priority: "P2"
epic: "undo-and-redo"
phase: "near-term"
depends_on: ["UNDO-03"]
---

# UNDO-06 · The change-history dialog goes; Undo and Redo are the whole model

*Filed 2026-09-20, the day UNDO-03 landed.* UNDO-03 gave both tools three history controls: Undo,
Redo and History. Shlomi's read on seeing it, and it is the right one: **a timeline is redundant once
Undo and Redo are two real buttons.** Either the dialog goes, or the toolbar goes back to one button
that opens it and holds undo and redo inside.

The second option is the model UNDO-01 shipped and UNDO-03 removed, for a reason recorded in both
tickets: a control that only exists while a dialog is open is, on a phone, no control at all, and the
dialog closed itself on use. Putting the most-used action in the editor two taps deep to save one
toolbar slot is the wrong trade, and the slot was affordable. So: the dialog goes.

## Why it is not just redundancy

The dialog's one non-redundant power was **selective revert** - checking an arbitrary set of steps
from the middle of the stack. That capability is what fights linear redo. `historyStack.ts`'s
`revertCommands` exists to draw the line: a contiguous run at the top of `past` keeps the redo
(it is undo by another name), anything else clears it. So the dialog could silently empty the redo
stack, and a person who had just undone three things could lose all three redos by touching the
timeline. Two models, one stack. Removing the dialog leaves one model.

Nothing else is lost. `actionHistory` is still persisted, so undo still reaches back across a
reload exactly as far as it did; only the *view* of the list and the checkbox revert go.

## What changes

- `src/editor-ui/UndoHistoryModal.tsx`, its CSS module and its test are deleted.
- Both toolbars drop their History control: **Sign 13 -> 12, Redact 10 -> 9.**
- `revertCommands` stays: Redact's five-second undo chip is still a live caller.
- The dead i18n keys go from `toolMessages.ts` (en + he) and `registry/messages.ts`.
- `.claude/rules/editor.md`'s "Undo and redo" section says two controls, and says the dialog was
  removed, so nobody rebuilds it.

## The toolbar budget comes back

UNDO-03 paid for two extra controls with two concessions, both now unnecessary:

- **Date gave up its label** (43.9px) on the labelled desktop row. It gets it back.
- **A thirteen-control tier and a 344px stand-down ladder** in `SignToolbar.module.css`, because
  thirteen cannot be balanced at the 44px floor (6+6+1 or 4+4+4+1). Twelve balances on its own at
  the existing eleven-control tier (6+6, and 4+4+4 below 287px), so that whole tier retires.

The 2px-off-every-gap concession at >=1300px is kept: re-measuring is what decides, not symmetry, and
the row has to clear 1172px with the wide Linux face.

## Acceptance

- Sign and Redact each show exactly Undo and Redo; no dialog exists to open.
- Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y unchanged.
- Redact's undo chip unchanged.
- The labelled desktop row measured in a real browser, wide font included, and the number recorded
  in `.claude/rules/editor.md`; `e2e/tool-toolbars/toolbar-desktop-one-line.spec.js` and
  `toolbar-touch-targets.spec.js` pass with no assertion relaxed.
- The full `ci.yml` chain green before the push.

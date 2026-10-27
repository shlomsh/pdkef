import { useRef, useEffect } from 'preact/hooks';
import { recordAction } from '../../../lib/actionTrail.ts';
import { useHistoryShortcuts } from '../../../lib/history/useHistoryShortcuts.js';
import type { ActionHistoryEntry } from '../../../editor/model/actionHistory.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { canRedo as canRedoOf, type RedactAction, type RedactState } from '../state/redactState.ts';
import { englishRedactMessages as t } from '../messages.ts';

// Redact design-review finding #3: one Undo chip, one slot, timed the same as
// Merge's own (PdfMergeTool.tsx's UNDO_WINDOW_MS/registerUndo) - a second
// eligible action before this elapses replaces the first's chip rather than
// stacking a second one.
const UNDO_WINDOW_MS = 5000;

/** The undo chip, undo and redo (keyboard and chip), over the reducer's history. */
export default function useRedactUndo({ state, dispatch }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
}) {
  const { undoAction } = state.edits;
  const actionHistory = state.edits.history.past;

  // Undo history mirrors the Sign tool's atomic add/delete/update commands
  // (see actionHistory.ts, useHistoryShortcuts.js). Add commands remove
  // their captured elements; delete and clear-page commands restore complete
  // snapshots at their original stacking indexes. Moves, resizes and colour
  // changes are 'update' commands, logged at updateElement's one choke point
  // (UNDO-04).
  //
  // `past`/`future` are src/editor/model/historyStack.ts's own shape, held as
  // one state value rather than two: `future` (newest-undone-first, in-memory
  // only, never persisted) gains entries from any revert of the newest
  // command, or the newest few together, whether that came from the keyboard
  // or the five-second undo chip - historyStack.ts's `revertCommands`
  // decides that from the stack rather than from what the caller intended. A
  // revert from the middle of the stack still clears it, because a later,
  // still-live command's snapshot never accounted for the element coming
  // back. Every place a new command is pushed onto `past` - every call into
  // useRedactCommands' add/remove/update - clears it too.
  //
  // One state value (not `actionHistory`/`redoHistory` as two useState hooks)
  // is what makes every read here `current.past`/`current.future` inside a
  // single functional update, so two undo keydowns landing in the same task
  // (ordinary key auto-repeat, no re-render between them) act on the actual
  // result of each other rather than both reverting the same render-scoped
  // "newest" entry - see applyRevert, undoLast and redoLast below.

  // Redact design-review finding #3: deleteElement and clearPage used to
  // change elements with no announcement and no way back short of the full
  // history modal or Cmd/Ctrl+Z. This chip mirrors Merge's own
  // (PdfMergeTool.tsx's undoAction/registerUndo): a short-lived pill in the
  // toolbar's status slot, naming the entry it can revert by id rather than
  // "whatever is newest" - correct even if another action lands before it is
  // clicked (see runUndoChip below).
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // Registers a short-lived Undo chip for a delete/clear command already
  // pushed onto actionHistory, and announces it through the live region.
  // Shared by deleteElement and clearPage (finding #3) - both are complete
  // atomic commands by the time this runs, so this only has to surface what
  // already happened, not perform it.
  const registerUndo = (message: string, entry: ActionHistoryEntry<RedactElement>, extra?: { label: string; onSelect: () => void }) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    dispatch({ type: 'UNDO_CHIP_SHOWN', message, entryId: entry.id, extra });
    undoTimerRef.current = setTimeout(() => dispatch({ type: 'UNDO_CHIP_DISMISSED' }), UNDO_WINDOW_MS);
  };

  const clearUndoChip = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    dispatch({ type: 'UNDO_CHIP_DISMISSED' });
  };

  // Cmd/Ctrl+Z reverts the single newest command; the reducer reads the
  // current `past`, so two undo keydowns landing in the same task (key
  // auto-repeat) are two distinct reverts. Nothing to undo reverts nothing.
  const undoLast = () => { dispatch({ type: 'UNDO', announceTemplate: t.undone }); if (actionHistory.length > 0) recordAction('undo'); };

  // The undo chip's own Undo button (finding #3): reverts the exact command
  // it named, by id, rather than "whatever is newest" - if another action
  // landed after this one and before the chip was clicked, reverting the
  // newest would silently revert the wrong thing. A stale id is a silent
  // no-op. Whether that revert leaves a redo behind is historyStack.ts's
  // `revertCommands` call, made from the stack itself.
  const runUndoChip = () => {
    if (!undoAction) return;
    const entryId = undoAction.entryId;
    clearUndoChip();
    dispatch({ type: 'UNDO', entryId, announceTemplate: t.undone });
    recordAction('undo');
  };

  // Shift+Cmd/Ctrl+Z or Ctrl+Y: reapplies the single most recently undone
  // command, the exact mirror of undoLast.
  const redoLast = () => { dispatch({ type: 'REDO', announceTemplate: t.redone }); if (canRedoOf(state)) recordAction('redo'); };

  useHistoryShortcuts(undoLast, redoLast);

  return { registerUndo, undoLast, redoLast, runUndoChip, clearUndoChip };
}

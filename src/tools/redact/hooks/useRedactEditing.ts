import { useRef, useEffect } from 'preact/hooks';
import { uniqueId } from '../../../editor/model/ids.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { useEyedropper } from '../../../editor-ui/whiteout/pageSampling.ts';
import { autoColorChanges, type PercentBox } from '../../../editor-ui/whiteout/pageColor.ts';
import { useHistoryShortcuts } from '../../../lib/history/useHistoryShortcuts.js';
import { formatMessage } from '../../../lib/formatMessage.ts';
import type { ActionHistoryEntry } from '../../../editor/model/actionHistory.ts';
import type { ElementUpdateKind } from '../../../editor/model/updateKind.ts';
import type { BlurStrength } from '../../../editor/model/blurStrength.ts';
import { isDeleteElement, type RedactElement } from '../lib/redactElements.ts';
import { canRedo as canRedoOf, type RedactAction, type RedactState } from '../state/redactState.ts';
import { englishRedactMessages as t } from '../messages.ts';
import useRedactCommands from './useRedactCommands.ts';
import useDeleteTool from './useDeleteTool.ts';
import useLinkedBoxes from './useLinkedBoxes.ts';
import useRedactDrawing from './useRedactDrawing.ts';
import type { RedactArming } from './useRedactArming.ts';

// Redact design-review finding #3: one Undo chip, one slot, timed the same as
// Merge's own (PdfMergeTool.tsx's UNDO_WINDOW_MS/registerUndo) - a second
// eligible action before this elapses replaces the first's chip rather than
// stacking a second one.
const UNDO_WINDOW_MS = 5000;

/**
 * Labels an update entry in the same voice as `Added ${type} box`. Redact has
 * no text elements, so a `text` kind (which cannot occur here) falls back to
 * the style label rather than going unhandled.
 */
function describeRedactUpdate(kind: ElementUpdateKind, type: string): string {
  if (kind === 'move') return formatMessage(t.movedBox, { type });
  if (kind === 'resize') return formatMessage(t.resizedBox, { type });
  return formatMessage(t.changedBoxColor, { type });
}

/**
 * Everything that changes the boxes: the command path every edit goes through,
 * the Delete tool, linked boxes, undo and redo (keyboard and the chip), colour
 * picks and the eyedropper, and drawing a box on a page.
 */
export default function useRedactEditing({ state, dispatch, setAnnouncement, fileBytes, pageWrapperRefs, samplePage, arming }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  fileBytes: ArrayBuffer | null;
  pageWrapperRefs: { current: (HTMLDivElement | null)[] };
  samplePage: (pageIndex: number, box: PercentBox) => string | null;
  arming: RedactArming;
}) {
  const { elements } = state.edits;
  const { file, numPages, pdfDocument } = state.document;
  const { selectedBoxId } = state.selection;
  const { eyedropping } = state.tool;
  const { undoAction } = state.edits;
  const actionHistory = state.edits.history.past;
  const { disarmTool, brushKind, rememberColor, rememberRecentColor, rememberBlurStrength } = arming;

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

  // RED-14: the one commit path every edit below goes through - one
  // EDIT_COMMITTED (elements, selection, history entry and revision change
  // together) and, for a removal, the undo chip.
  const commands = useRedactCommands<RedactElement>({
    elements,
    commit: (commit) => dispatch({ type: 'EDIT_COMMITTED', ...commit }),
    registerUndo,
    describeUpdate: (kind, element) => describeRedactUpdate(kind, element.type),
  });

  const { handlePointerDown, addStroke, drawingPreviewRef } = useRedactDrawing({
    state, dispatch, setAnnouncement, disarmTool, brushKind, samplePage, add: commands.add,
  });

  // RED-14: the Delete tool's own state and marking, moved out wholesale -
  // this island still renders DeleteLift/DeletableObjectOverlay, reading
  // everything else from the hook.
  const deleteTool = useDeleteTool({
    elements,
    file,
    fileBytes,
    pdfDocument,
    pageWrapperRefs,
    add: commands.add,
    announce: setAnnouncement,
    disarmTool,
  });

  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    commands.remove(new Set([id]), {
      type: 'DELETE_ELEMENT', description: formatMessage(t.removedBox, { type: el.type }), pageIndex: el.pageIndex, chipMessage: formatMessage(t.removedBox, { type: el.type }),
    });
    recordAction('delete_mark');
  };

  // RED-14: every edit that can fan out to a linked box's repeat group or
  // find set - updateElement, duplicateElement, unlinkFromGroup,
  // removeLinked, clearPage/clearPageOptions, repeatOnEveryPage - lives in
  // useLinkedBoxes.ts now. `select` mirrors what duplicateElement itself
  // used to do: sets both the sticky selection and the hover target to the
  // box it just created.
  const linkedBoxes = useLinkedBoxes<RedactElement>({
    elements,
    numPages,
    uniqueId,
    commands,
    select: (id) => dispatch({ type: 'BOX_SELECTED', id }),
    derive: (element, changes) => (isDeleteElement(element) ? {} : autoColorChanges(element, changes as Partial<typeof element>, samplePage)),
  });
  const { unlinkFromGroup, clearPageOptions } = linkedBoxes;
  // The trail names what the edit was: a patch that reaches width or height is a resize, one that
  // only moves left/top is a move, anything else (colour, strength) a style edit. Names only.
  const updateElement = (id: string, changes: Partial<RedactElement>) => {
    linkedBoxes.updateElement(id, changes);
    recordAction('width' in changes || 'height' in changes ? 'resize_mark' : 'left' in changes || 'top' in changes ? 'move_mark' : 'edit_mark');
  };
  const duplicateElement = (id: string) => { linkedBoxes.duplicateElement(id); recordAction('place_mark'); };
  const repeatOnEveryPage = (id: string) => { linkedBoxes.repeatOnEveryPage(id); recordAction('place_mark'); };
  const removeLinked = (id: string, kind: Parameters<typeof linkedBoxes.removeLinked>[1]) => { linkedBoxes.removeLinked(id, kind); recordAction('delete_mark'); };
  const clearPage = (pageIndex: number) => { linkedBoxes.clearPage(pageIndex); recordAction('delete_mark'); };
  const keepOnlyThis = (id: string) => { linkedBoxes.keepOnlyThis(id); recordAction('delete_mark'); };

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

  // RED-51: a picked colour stops the box following the page and is remembered
  // like any choice; an automatic sample never goes through rememberColor.
  const pickColor = (id: string, color: string) => {
    updateElement(id, { color, colorMode: 'custom' });
    rememberColor(color);
    rememberRecentColor(color);
  };
  const matchPage = (id: string) => updateElement(id, { colorMode: 'auto' });
  const pickBrushColor = (color: string) => {
    rememberColor(color);
    rememberRecentColor(color);
  };

  // Two pipettes, one active at a time: the brush's, or the selected whiteout's.
  const selectedEl = elements.find((el) => el.id === selectedBoxId);
  const hasBrushTarget = brushKind === 'whiteout';
  const selectedWhiteoutId = selectedEl && (selectedEl.type === 'whiteout' || selectedEl.type === 'whiteoutStroke') ? selectedEl.id : null;
  useEyedropper(
    (eyedropping === 'brush' && hasBrushTarget) || (eyedropping === 'box' && selectedWhiteoutId !== null),
    (color) => (eyedropping === 'box' && selectedWhiteoutId !== null ? pickColor(selectedWhiteoutId, color) : pickBrushColor(color)),
    () => dispatch({ type: 'EYEDROPPER_STOPPED' }),
    '.redact-draw-area',
  );
  useEffect(() => {
    dispatch({ type: 'EYEDROPPER_STOPPED' });
  }, [hasBrushTarget, selectedWhiteoutId]);

  // Passed to RedactBoxToolbar for blur boxes: applies the strength and
  // remembers it, as pickColor above does for a whiteout's chosen colour.
  const changeBlurStrength = (id: string, strength: BlurStrength) => {
    updateElement(id, { strength });
    rememberBlurStrength(strength);
  };

  return {
    commands, deleteTool, handlePointerDown, addStroke, drawingPreviewRef, deleteElement, updateElement,
    duplicateElement, repeatOnEveryPage, removeLinked, clearPage, keepOnlyThis, unlinkFromGroup, clearPageOptions,
    undoLast, redoLast, runUndoChip, clearUndoChip, pickColor, matchPage, changeBlurStrength,
  };
}

export type RedactEditing = ReturnType<typeof useRedactEditing>;

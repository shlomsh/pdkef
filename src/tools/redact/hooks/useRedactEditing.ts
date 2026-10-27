import { useEffect } from 'preact/hooks';
import { uniqueId } from '../../../editor/model/ids.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { useEyedropper } from '../../../editor-ui/whiteout/pageSampling.ts';
import { autoColorChanges, type PercentBox } from '../../../editor-ui/whiteout/pageColor.ts';
import { formatMessage } from '../../../lib/formatMessage.ts';
import type { ElementUpdateKind } from '../../../editor/model/updateKind.ts';
import type { BlurStrength } from '../../../editor/model/blurStrength.ts';
import { isDeleteElement, type RedactElement } from '../lib/redactElements.ts';
import type { RedactAction, RedactState } from '../state/redactState.ts';
import { englishRedactMessages as t } from '../messages.ts';
import useRedactCommands from './useRedactCommands.ts';
import useDeleteTool from './useDeleteTool.ts';
import useLinkedBoxes from './useLinkedBoxes.ts';
import useRedactUndo from './useRedactUndo.ts';
import useRedactDrawing from './useRedactDrawing.ts';
import type { RedactArming } from './useRedactArming.ts';

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
  const { disarmTool, brushKind, rememberColor, rememberRecentColor, rememberBlurStrength } = arming;

  const { registerUndo, undoLast, redoLast, runUndoChip, clearUndoChip } = useRedactUndo({ state, dispatch });

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

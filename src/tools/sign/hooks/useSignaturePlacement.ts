import { useState } from 'preact/hooks';
import type { EditorElement } from '../../../editor/model/editorModel.ts';
import type { SavedSignature } from '../../../editor/model/savedSignature.ts';
import type { DocumentStyle } from '../../../editor/model/documentStyle.ts';
import { captureAddedElement, type HistoryLogger } from '../../../editor/model/actionHistory.ts';
import { uniqueId } from '../../../editor/model/ids.ts';
import { DEFAULT_START_WIDTH_PCT } from '../../../editor/model/signGeometry.js';
import type { SignMessages } from '../../../editor/registry/messages';
import { recordAction } from '../../../lib/telemetry/actionTrail.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';
import { buildPlacedSignature } from '../lib/signaturePlacement.ts';
import type { PendingSignaturePlacement } from './useWorkspaceGestures.ts';

interface SignaturePlacementOptions {
  dispatch: (action: SignToolAction) => void;
  elements: EditorElement[];
  style: Partial<DocumentStyle>;
  pageWrapperRefs: { current: (HTMLDivElement | null)[] };
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  saveNewSignature: (dataUrl: string, aspectRatio: number) => { signature: SavedSignature; persisted: boolean };
  setActiveSignature: (signature: SavedSignature) => void;
  messages: SignMessages;
}

/** Placing a signature on a page, and the dialog that creates one and places it in the same step. */
export function useSignaturePlacement({
  dispatch, elements, style, pageWrapperRefs, logAction, setAnnouncement, saveNewSignature, setActiveSignature, messages: t,
}: SignaturePlacementOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempPlacement, setTempPlacement] = useState<PendingSignaturePlacement | null>(null);

  // Helper to place a signature at a specific location
  const placeSignatureAt = (dataUrl: string, aspectRatio: number, pageIdx: number, leftPercent: number, topPercent: number) => {
    const id = uniqueId();
    const wrapper = pageWrapperRefs.current[pageIdx];
    const rect = wrapper?.getBoundingClientRect();
    const newEl = buildPlacedSignature({
      id,
      dataUrl,
      aspectRatio,
      pageIndex: pageIdx,
      leftPercent,
      topPercent,
      // Width defaults to whatever the last placed/resized signature used, so
      // consecutive placements of the same signature keep its size instead of
      // resetting to the default every time.
      widthPercent: style.signatureWidth ?? DEFAULT_START_WIDTH_PCT,
      wrapperSize: rect && { width: rect.width, height: rect.height },
    });

    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    logAction('add', 'ADD_SIGNATURE', pageIdx, t.addedSignatureDescription, [captureAddedElement(newEl, elements.length)]);
    setAnnouncement(t.placedSignatureOnPage);
  };

  // Add signature element from modal
  const handleAddSignatureElement = (dataUrl: string, aspectRatio: number) => {
    const { signature: newSig, persisted } = saveNewSignature(dataUrl, aspectRatio);
    recordAction('draw');
    setActiveSignature(newSig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });

    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    recordAction('place_mark');
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    // The dialog both creates and places the signature, so that counts as the
    // tool's one placement - same as a click-placement on the page overlay.
    dispatch({ type: 'DISARM_TOOL' });
    setDialogOpen(false);
    setTempPlacement(null);
    if (!persisted) {
      setAnnouncement(t.signaturePlacedNotSaved);
    }
  };

  return {
    dialogOpen,
    setDialogOpen,
    setTempPlacement,
    placeSignatureAt,
    handleAddSignatureElement,
    closeDialog: () => {
      setDialogOpen(false);
      setTempPlacement(null);
    },
  };
}

import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { uniqueId } from '#editor/model/ids.ts';
import type { PlaceHistoryEntry } from '#editor/model/actionHistory.ts';
import { checkBoxesFromElements } from '../lib/check/checkBoxes.ts';
import { removedMessage, type InPlaceFinding } from '../lib/check/checkCopy.ts';
import { deletedTerms } from '../lib/check/deletedTerms.ts';
import { uncoveredMatches } from '../lib/find/findMatches.ts';
import type { CheckTerm } from '../lib/check/types.ts';
import { describeDetails } from '../lib/details/describeDetails.ts';
import type { DetailEdits } from '../lib/detailEdits.js';
import { selectRemovedPlaces, type RedactAction, type RedactState } from '../state/redactState.ts';
import { useDocumentDetails } from './details/useDocumentDetails.ts';
import useSavedFileCheck, { traceLocale } from './useSavedFileCheck.ts';
import type { ExportOverrides } from './useRedactExport.ts';
import type { RedactFind } from './useRedactFind.ts';

/**
 * What the file says about itself (RED-59) with the sheet that edits it, the check
 * of each saved export (RED-17), and the re-save that Remove it and closing the
 * sheet run through the normal export (RED-60, RED-25).
 */
export default function useRedactDetails({ state, dispatch, setAnnouncement, fileBytes, findKit, handleSavePdf }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  fileBytes: ArrayBuffer | null;
  findKit: RedactFind;
  handleSavePdf: (mode: 'download' | 'share', overrides?: ExportOverrides) => Promise<boolean>;
}) {
  const { elements, documentRevision } = state.edits;
  const { pdfDocument } = state.document;
  const { exportedForHandoff, removing } = state.finish;
  const { find, redactMatches } = findKit;

  // RED-17: the check of each saved export. Every page with a box is saved
  // as a picture, with no text layer at all (redact.js), so those are the
  // pages text search can't see.
  const checkBoxes = checkBoxesFromElements(elements);
  // RED-59: what the file says about itself, as it was opened.
  const traces = useDocumentDetails(fileBytes, pdfDocument !== null);
  const rows = useMemo(() => (traces ? describeDetails(traces, { locale: traceLocale(), now: new Date() }) : []), [traces]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsAtOpenRef = useRef<DetailEdits>({});
  const openDetails = () => { detailsAtOpenRef.current = state.edits.details; setDetailsOpen(true); };
  const savedCheck = useSavedFileCheck({
    pdfDocument,
    originalBytes: fileBytes,
    announce: setAnnouncement,
    detailEdits: state.edits.details,
    detailRows: rows,
    saved: exportedForHandoff?.blob ?? null,
    boxes: checkBoxes,
    deletedWords: deletedTerms(elements),
    picturePages: [...new Set(checkBoxes.map((box) => box.pageIndex))].sort((a, b) => a - b),
    measure: find.measure,
  });
  const coverFromCheck = (term: CheckTerm, pageIndex: number) => {
    if (savedCheck.state.status !== 'done') return;
    const pages = savedCheck.state.outcome.context.original.filter((page) => page.text.pageIndex === pageIndex);
    redactMatches(uncoveredMatches(pages, term.finder, checkBoxes, find.measure));
  };

  // RED-60: a change that takes something out of the saved file is a history
  // step, and the file is saved again through the normal export (which replays
  // every step). The edit bumps `documentRevision`, whose invalidation effect
  // retires any export begun before the render, so the export starts from an
  // effect declared after it, once the new revision is the current one.
  const pendingExportRef = useRef<null | { overrides: ExportOverrides; done: (ok: boolean) => void }>(null);
  useEffect(() => {
    const pending = pendingExportRef.current;
    if (!pending) return;
    pendingExportRef.current = null;
    // expected: handleSavePdf reports its own failures; a rejection here only releases the waiting button
    handleSavePdf('download', pending.overrides).then(pending.done, () => pending.done(false));
  }, [documentRevision]);

  const reexport = async (change: () => void, overrides: ExportOverrides, note?: string) => {
    if (removing || savedCheck.state.status !== 'done' || !exportedForHandoff) return;
    dispatch({ type: 'REMOVE_STARTED' });
    try {
      const exported = new Promise<boolean>((resolve) => { pendingExportRef.current = { overrides, done: resolve }; });
      change();
      if ((await exported) && note) dispatch({ type: 'REMOVAL_NOTED', note });
    } finally {
      dispatch({ type: 'REMOVE_SETTLED' });
    }
  };

  // RED-25: Remove it.
  const removeFromCheck = async (finding: InPlaceFinding) => {
    if (savedCheck.state.status !== 'done') return;
    const place = savedCheck.state.outcome.context.saved.places[finding.placeIndex];
    if (!place) return;
    const entry: PlaceHistoryEntry = {
      id: uniqueId(),
      type: 'place',
      operation: 'remove-place',
      place,
      pageIndex: place.pageIndex ?? 0,
      description: removedMessage(place).replace(/ Saved again and downloaded\.$/, '').replace(/\.$/, ''),
      timestamp: Date.now(),
    };
    await reexport(
      () => dispatch({ type: 'PLACE_REMOVED', entry }),
      { removedPlaces: [place, ...selectRemovedPlaces(state)] },
      removedMessage(place),
    );
  };

  // RED-59: closing the sheet commits what changed in it. An existing export
  // is made again with the new details; otherwise the commit only saves the draft.
  const closeDetails = () => {
    setDetailsOpen(false);
    if (JSON.stringify(state.edits.details) === JSON.stringify(detailsAtOpenRef.current)) return;
    const commit = () => dispatch({ type: 'DETAILS_COMMITTED' });
    if (removing || savedCheck.state.status !== 'done' || !exportedForHandoff) { commit(); return; }
    return reexport(commit, { details: state.edits.details });
  };

  return { traces, rows, detailsOpen, openDetails, closeDetails, savedCheck, coverFromCheck, removeFromCheck };
}

export type RedactDetails = ReturnType<typeof useRedactDetails>;

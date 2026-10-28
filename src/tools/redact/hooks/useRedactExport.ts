import { useEffect, useRef } from 'preact/hooks';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { dropCause, reportError } from '#lib/telemetry/errorReport.ts';
import { isEncryptedPdfError } from '#lib/pdf/encryptedPdfError.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import { useNavigatingAway } from '#lib/hooks/useNavigatingAway.ts';
import type { RedactHandoffTarget } from '#lib/app/toolIds.ts';
import type { HistoryPlace } from '#editor/model/actionHistory.ts';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import type { DetailEdits } from '../lib/detailEdits.js';
import type { SavedPlace } from '../lib/check/types.ts';
import { redactedFileName } from '../lib/redactFileName.ts';
import { englishRedactMessages as t } from '../messages.ts';
import { selectDetailEdits, selectRemovedPlaces, type RedactAction, type RedactState, type SavedExport } from '../state/redactState.ts';

/** A call right after a dispatch passes the fresh values the closure has not seen yet (removedPlaces newest first). */
export type ExportOverrides = { removedPlaces?: HistoryPlace[]; details?: DetailEdits };

/**
 * The export Download, Share and the hand-off chips all run, and the retirement
 * of an export the document has moved on from (DEBT-18, RED-36). It owns the
 * share state and the hand-off busy flag, and reads the reducer state it exports.
 */
export default function useRedactExport({ state, dispatch, setAnnouncement, setNeedsUnlock, getFileBytes }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  setNeedsUnlock: (kind: NeedsUnlockKind | null) => void;
  getFileBytes: () => ArrayBuffer | null;
}) {
  const { file, status } = state.document;
  const { elements, documentRevision } = state.edits;
  const { exportedForHandoff } = state.finish;
  // Draft persistence needs an editor-owned baseline, not a guess based on
  // when a File object first appeared. A load/restoration captures the current
  // revision; every real document operation advances it.
  const documentRevisionRef = useRef(documentRevision);
  documentRevisionRef.current = documentRevision;
  // DEBT-18: an export is only wanted while the document it was started from
  // is still the document on screen. Both keys are read fresh on every check,
  // so a file swap or any edit that bumps the revision - including an undo or
  // redo arriving by keyboard while `.is-processing` blocks the pointer -
  // retires the run in flight.
  const exportRun = useLatestRun(() => [file, documentRevisionRef.current]);
  // Read by the invalidation effect below, which fires after the render that
  // already moved status on (a replacement file sets 'loading' in the same
  // batch as `file`), so it must ask what the workspace is showing now.
  const statusRef = useRef(status);
  statusRef.current = status;
  const { canSharePdf, shareReady, prepare, clearPrepared, download, downloadPrepared, sharePrepared } = usePdfShare();
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();

  useEffect(() => () => {
    // An export resolving after the editor has left the tree must not fire a
    // download for a tool the person walked away from (Sign does the same
    // with its own useLatestRun).
    exportRun.invalidate();
  }, []);

  // A generated PDF must match the current source and redaction boxes - the
  // "Compress" hand-off's own prepared bytes go stale on exactly the same
  // change, so it is cleared alongside usePdfShare's own prepared file.
  useEffect(() => {
    clearPrepared();
    dispatch({ type: 'SAVED_EXPORT_DISCARDED' });
    // An export still running was started from boxes that no longer exist.
    // Retiring it here rather than in handleSavePdf's own bail is what lets
    // the workspace come back out of `.is-processing`: only this effect knows
    // the difference between "the user changed the document" and "a second
    // export superseded the first", and only the first case should hand the
    // editor back. Mirrors PdfSignTool.tsx's own invalidation effect.
    if (!exportRun.invalidate()) return;
    // Only the export's own screen is ours to take down. A replacement file
    // invalidates the export too, and its loader has already put the
    // workspace into 'loading' - saying "editing" over that would show an
    // empty editor for the file still being read.
    if (statusRef.current !== 'redacting') return;
    dispatch({ type: 'EXPORT_CANCELLED', announcement: t.exportSuperseded });
    // Keyed on the revision, not on `elements`, so this fires on exactly what
    // `exportRun`'s own keys ([file, documentRevisionRef.current]) watch. With
    // two different notions of "the document moved", an edit that bumped the
    // revision without replacing the elements array would retire the run
    // while leaving this effect asleep, and the workspace would stay behind
    // `.is-processing` with no way out but a reload. Sign keys on the
    // revision for the same reason (PdfSignTool.tsx).
  }, [file, documentRevision, clearPrepared, exportRun]);

  const exportRedacted = async (exportAction: 'download' | 'share' | 'handoff' = 'download', overrides: ExportOverrides = {}): Promise<SavedExport | null> => {
    if (!file) return null;
    if (elements.length === 0) {
      setAnnouncement(t.drawFirst);
      return null;
    }

    const hasBoxes = elements.some((el) => el.type !== 'delete');
    dispatch({
      type: 'EXPORT_STARTED',
      announcement: hasBoxes ? t.exportSaving : t.exportDeleting,
    });
    recordAction('export');
    reportToolLifecycleEvent('tool_operation_started', 'redact');

    // DEBT-18: everything this run is an export *of*, captured before the
    // first await. `sourceFile` is used below instead of `file` so the name
    // on the result can never be a newer file's.
    const run = exportRun.begin();
    const sourceFile = file;
    // DEBT-51: the bytes read at load time, so a file moved on disk after
    // picking cannot fail the export (the browser rejects a second read).
    const sourceBytes = getFileBytes() ?? sourceFile;

    try {
      // DEBT-20: applyPageEdits pulls in @cantoo/pdf-lib, which is only needed
      // to write the export. Importing it here instead of at module scope keeps
      // it out of everything /redact/ downloads and compiles before a file is
      // even open. A failed chunk load lands in the same catch as a failed
      // export, which is the right outcome: the boxes stay, the message is
      // "try again". Repeat exports reuse the module registry's copy.
      const [{ applyPageEdits }, { removePlaces }] = await Promise.all([
        import('../lib/applyPageEdits.js'),
        import('../lib/check/removePlaces.ts'),
      ]);
      // RED-60: every removal replays, oldest first, onto the new document.
      const places = [...(overrides.removedPlaces ?? selectRemovedPlaces(state))].reverse();
      const { blob: redactedBlob } = await applyPageEdits(sourceBytes, elements, (p) => {
        if (run.isCurrent()) dispatch({ type: 'EXPORT_PROGRESS', progress: p });
      }, {
        finish: (doc) => removePlaces(doc, places as SavedPlace[]),
        details: overrides.details ?? selectDetailEdits(state),
      });
      if (!run.isCurrent()) return null;
      run.settle();
      const filename = redactedFileName(sourceFile.name);
      // Finding #4: a successful export (either export path - Download or
      // Share - counts) is what unlocks the "Compress" hand-off below.
      const saved = { blob: redactedBlob, name: filename };
      dispatch({ type: 'EXPORT_SAVED', saved });

      if (exportAction === 'handoff') {
        // The chips want the file, not a download: make it, keep it, deliver nothing.
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.readyHandoff });
      } else if (exportAction === 'share' && prepare(redactedBlob, filename)) {
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.readyShare });
        reportToolLifecycleEvent('tool_result_ready', 'redact');
      } else {
        recordAction('download');
        download(redactedBlob, filename);
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.savedStarted });
        reportToolLifecycleEvent('tool_result_ready', 'redact');
      }
      return saved;
    } catch (err) {
      reportError('redact', err, 'export');
      console.error(err);
      // ENC-02: the load gate should have caught a protected file, so this is reported above (a gate
      // miss), but the person gets the way on rather than a Try again that can never work.
      if (run.isCurrent() && isEncryptedPdfError(err)) {
        run.settle();
        setNeedsUnlock('owner-restricted');
        dispatch({ type: 'EXPORT_FAILED', detail: '', announcement: t.pdfProtected });
        return null;
      }
      // A failure nobody is waiting for any more: the invalidation effect has
      // already put the editor back, and reporting it would blame the user's
      // current boxes for a run they replaced.
      if (!run.isCurrent()) return null;
      run.settle();
      reportToolLifecycleEvent('tool_operation_failed', 'redact');
      // Recoverable: keep the workspace mounted so the boxes that caused the
      // failure are still there to fix, instead of unmounting the editor
      // behind a dead-end error screen (status='error' is reserved for a
      // failed document load, which never gets this far).
      // A tab left open across a deploy asks for chunks the new deploy no longer serves, so a retry
      // fails the same way (seen 2026-10-22: one tab, four tries). A reload fixes it and restores the draft.
      const detail = dropCause(err) === 'module_load'
        ? t.exportUpdated
        : t.exportFailed;
      dispatch({ type: 'EXPORT_FAILED', detail, announcement: formatMessage(t.downloadStoppedDetail, { detail }) });
      return null;
    }
  };

  // The export Download, Share and the hand-off chips all run: makes the redacted file
  // and keeps it as exportedForHandoff. Saving it to the device is exportRedacted's
  // delivery step, chosen by exportAction, so a hand-off never triggers a download.
  const handleSavePdf = async (exportAction: 'download' | 'share' = 'download', overrides: ExportOverrides = {}): Promise<boolean> =>
    (await exportRedacted(exportAction, overrides)) !== null;

  // Skips regenerating the redacted PDF when a Share-prepared file already
  // matches the current elements (usePdfShare.downloadPrepared - cleared
  // automatically by the effect above whenever file/elements change, so this
  // never serves a stale export). Mirrors PdfSignTool's handleDownloadPdf.
  const handleDownloadPdf = () => {
    dispatch({ type: 'EXPORT_ERROR_CLEARED' });
    if (downloadPrepared()) {
      setAnnouncement(t.downloadStarted);
      recordAction('download');
      return;
    }
    void handleSavePdf('download'); // reason: exportRedacted catches and reports its own failure
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      setAnnouncement(t.shared);
      recordAction('share');
    } else if (result.status === 'canceled') {
      setAnnouncement(t.shareCanceled);
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement(t.shareError);
    }
  };

  // Finding #4: hands the redacted bytes to Compress or Sign without
  // re-picking, the same one-shot baton Merge's own hand-off uses
  // (draftStore.js's saveHandoff/takeHandoff, consumed on the other end by
  // useHandoffIntake.ts) - reused here rather than copied, since Redact is
  // a tool and cannot import another tool's PdfMergeTool.tsx (module
  // boundaries). The chips show whenever Download is enabled: an export that
  // still matches the document (any edit drops it) is handed on as is, else
  // the same export Download runs is made first, without saving it to the device.
  const requestHandoff = async (tool: RedactHandoffTarget) => {
    if (handoffBusy) return;
    setHandoffBusy(true);
    dispatch({ type: 'HANDOFF_STARTED' });
    try {
      const exported = exportedForHandoff ?? await exportRedacted('handoff');
      if (!exported) throw new Error('export');
      await sendHandoff(tool, { fileName: exported.name, fileType: 'application/pdf', fileBytes: await exported.blob.arrayBuffer() });
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the handoff-failed state
      console.error(err);
      dispatch({ type: 'HANDOFF_FAILED' });
      setHandoffBusy(false);
    }
  };

  return { canSharePdf, shareReady, handoffBusy, handleSavePdf, handleDownloadPdf, handleSharePdf, requestHandoff };
}

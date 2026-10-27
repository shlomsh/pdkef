import type { EditorElement } from '../../../editor/model/editorModel.ts';
import type { SignMessages } from '../../../editor/registry/messages';
import { recordAction } from '../../../lib/actionTrail.ts';
import { sendHandoff } from '../../../lib/sendHandoff.ts';
import { useNavigatingAway } from '../../../lib/useNavigatingAway.ts';
import type { LatestRun } from '../../../lib/useLatestRun.ts';
import type { usePdfShare } from '../../../lib/usePdfShare.js';
import { exportAtRevision, exportToHandOff, handoffHref, type SignedExport } from '../lib/exportHandoff.ts';
import { runSignExport } from '../lib/runSignExport.ts';
import type { SignLifecycleAction } from '../state/signState.ts';

interface SignExportOptions {
  file: File | null;
  fileBytesRef: { current: ArrayBuffer | null };
  elements: EditorElement[];
  exportRun: LatestRun;
  activeExportSpeculativeRef: { current: boolean };
  documentRevisionRef: { current: number };
  preparedExportRef: { current: SignedExport | null };
  signedExport: SignedExport | null;
  share: ReturnType<typeof usePdfShare>;
  lifecycleDispatch: (action: SignLifecycleAction) => void;
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
}

/**
 * The export actions: sign for sharing, download, share, and carrying the signed
 * file on to another tool. The signing run itself is lib/runSignExport.ts.
 */
export function useSignExport({
  file, fileBytesRef, elements, exportRun, activeExportSpeculativeRef, documentRevisionRef, preparedExportRef,
  signedExport, share, lifecycleDispatch, setAnnouncement, messages: t,
}: SignExportOptions) {
  const { prepare, download, downloadPrepared, sharePrepared } = share;
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();

  const runExport = async (
    onSigned: (signedBlob: Blob, filename: string) => void,
    options: { speculative?: boolean } = {},
  ) => {
    if (!file) return;
    await runSignExport(
      { file, fileBytes: fileBytesRef.current, elements, exportRun, activeExportSpeculativeRef, lifecycleDispatch, messages: t },
      onSigned,
      options,
    );
  };

  // Apply signing and prepare the PDF for sharing or downloading.
  const handleSavePdf = () => runExport((signedBlob, filename) => {
    const made = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
    if (prepare(signedBlob, filename)) {
      preparedExportRef.current = made;
      // navigator.share() needs a fresh user activation. PDF generation is
      // asynchronous, so retain the File and let the next tap open the
      // native share sheet instead of risking a browser-blocked request.
      lifecycleDispatch({ type: 'EXPORT_FINISHED', signedExport: made, announcement: t.signedPdfReadyToShare });
      return;
    }

    recordAction('download');
    download(signedBlob, filename);
    lifecycleDispatch({ type: 'EXPORT_FINISHED', announcement: t.pdfSignedDownloadStarted });
  });

  const handleDownloadPdf = () => {
    lifecycleDispatch({ type: 'EXPORT_ERROR_CLEARED' });
    if (downloadPrepared()) {
      recordAction('download');
      lifecycleDispatch({
        type: 'EXPORT_DELIVERED',
        signedExport: exportAtRevision(preparedExportRef.current, documentRevisionRef.current),
        announcement: t.downloadStarted,
      });
      return;
    }

    void runExport((signedBlob, filename) => { // reason: runExport catches its own failure and shows it
      recordAction('download');
      download(signedBlob, filename);
      lifecycleDispatch({
        type: 'EXPORT_FINISHED',
        signedExport: { blob: signedBlob, name: filename, revision: documentRevisionRef.current },
        announcement: t.pdfSignedDownloadStarted,
      });
    });
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      recordAction('share');
      lifecycleDispatch({
        type: 'EXPORT_DELIVERED',
        signedExport: exportAtRevision(preparedExportRef.current, documentRevisionRef.current),
        announcement: t.pdfSignedSuccessfully,
      });
    } else if (result.status === 'canceled') {
      setAnnouncement(t.sharingCanceledStillReady);
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement(t.shareOpenFailed);
    }
  };

  // Carries a signed export to another tool through the one-shot hand-off baton
  // (draftStore's saveHandoff, taken by useHandoffIntake on the other end), as Redact does.
  const carryOn = async (tool: string, current: SignedExport) => {
    try {
      await sendHandoff(
        tool,
        { fileName: current.name, fileType: 'application/pdf', fileBytes: await current.blob.arrayBuffer() },
        { href: handoffHref(tool, window.location.pathname) },
      );
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the quiet line
      console.error(err);
      lifecycleDispatch({ type: 'HANDOFF_FAILED' });
      setHandoffBusy(false);
    }
  };

  // The chips show whenever export is ready. A file already made for this revision
  // (a download, or the prepared share file) goes straight on; otherwise the export
  // runs first, without downloading, and its result is handed on.
  const requestHandoff = async (tool: string) => {
    if (handoffBusy) return;
    setHandoffBusy(true);
    const ready = exportToHandOff(signedExport, preparedExportRef.current, documentRevisionRef.current);
    lifecycleDispatch({ type: 'HANDOFF_REQUESTED', ready });
    if (ready) {
      await carryOn(tool, ready);
      return;
    }
    let handedOn = false;
    await runExport((signedBlob, filename) => {
      handedOn = true;
      const made = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
      lifecycleDispatch({ type: 'EXPORT_FINISHED', signedExport: made });
      void carryOn(tool, made); // reason: carryOn catches its own failure and shows the hand-off error
    });
    // A failed or superseded export hands nothing on: runExport shows its own error.
    if (!handedOn) setHandoffBusy(false);
  };

  return { runExport, handleSavePdf, handleDownloadPdf, handleSharePdf, requestHandoff, handoffBusy };
}

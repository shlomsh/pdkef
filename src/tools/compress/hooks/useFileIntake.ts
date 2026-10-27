import { useEffect, useRef } from 'preact/hooks';
import type { MutableRef, Dispatch, StateUpdater } from 'preact/hooks';
import { probeEncryption } from '../../../lib/pdfEncryption.ts';
import { deriveFileKind } from '../../../lib/fileKind.js';
import { useHandoffIntake } from '../../../lib/useHandoffIntake.ts';
import type { LatestRun } from '../../../lib/useLatestRun.ts';
import { openPdfDoc } from '../../../lib/openPdfDoc.ts';
import { reportError } from '../../../lib/errorReport.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage';
import type { useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import { isCurrentAnalysis } from '../state/compressMachine.ts';
import type { useCompressMachine } from '../state/useCompressMachine.ts';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from './useComparePreviews.ts';

export interface PdfAnalysis { images: unknown[]; hasText: boolean; imageShare: number; pageCount: number }

interface FileIntakeInput {
  t: CompressMessages;
  machine: ReturnType<typeof useCompressMachine>;
  compare: ReturnType<typeof useComparePreviews>;
  flow: ReturnType<typeof useDownloadFlow>;
  encryptionCheck: LatestRun;
  file: File | null;
  fileSeq: number;
  runnable: boolean;
  preparedStatus: string;
  prepareNow: () => void;
  forgetLast: () => void;
  currentFileRef: MutableRef<File | null>;
  setFile: Dispatch<StateUpdater<File | null>>;
  setFileSeq: Dispatch<StateUpdater<number>>;
  setRejectedFiles: Dispatch<StateUpdater<string[]>>;
  setAnnouncement: Dispatch<StateUpdater<string>>;
  setNeedsUnlockBytes: Dispatch<StateUpdater<ArrayBuffer | null>>;
  setAnalysis: Dispatch<StateUpdater<PdfAnalysis | null>>;
}

/** Everything that happens when a file is picked, dropped or handed off: accept, check, analyse, open the gate. */
export function useFileIntake(input: FileIntakeInput) {
  const { t, machine, compare, flow, encryptionCheck, file, fileSeq, runnable, preparedStatus, prepareNow, forgetLast, currentFileRef,
    setFile, setFileSeq, setRejectedFiles, setAnnouncement, setNeedsUnlockBytes, setAnalysis } = input;

  const handleFilesAdded = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted = incoming.filter((f) => deriveFileKind(f) !== null);
    const rejected = incoming.filter((f) => deriveFileKind(f) === null);

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (accepted.length > 0) {
      const next = accepted[0];
      // A new file's key differs from the old one's, so the old build is dropped and its cache never hit.
      machine.send({ type: 'fileAccepted' });
      setFileSeq((n) => n + 1);
      currentFileRef.current = next;
      setFile(next);
      forgetLast();
      flow.reset();
      compare.clear();
      compare.clearOriginal();
      setAnnouncement(formatMessage(deriveFileKind(next) === 'image' ? t.imageLoaded : t.loaded, { name: next.name }));
      recordAction('add_files');
      setNeedsUnlockBytes(null);
      encryptionCheck.invalidate();
      setAnalysis(null);
      if (deriveFileKind(next) === 'pdf') {
        void checkEncryption(next); // reason: checkEncryption catches and reports its own failure
        void analyze(next); // reason: analyze catches and reports its own failure
      } else {
        compare.loadOriginal(next);
        openGate();
      }
    }
  };

  // Reads the PDF's make-up for the "nothing to shrink" note. A newer file wins: a stale result is dropped.
  const analyze = async (pdf: File) => {
    const token = machine.read().analysisToken;
    await analyzeInner(pdf, token);
  };

  const analyzeInner = async (pdf: File, token: number) => {
    let doc;
    let totalBytes = 0;
    try {
      // A restricted PDF opens with an empty password so text detection sees plaintext, not ciphertext.
      const opened = await openPdfDoc(pdf, { encryption: 'empty-password', updateMetadata: false });
      doc = opened.doc;
      totalBytes = opened.bytes.byteLength;
    } catch {
      // expected: a PDF pdf-lib can't parse just gets no analysis note
      return;
    }
    try {
      // Dynamic: analyzePdf.js pulls in pdf-lib, which must not ride in the first download (DEBT-20).
      const { analyzePdf } = await import('../lib/analyzePdf.js');
      const result = analyzePdf(doc, { totalBytes });
      if (isCurrentAnalysis(machine.read(), token)) setAnalysis(result);
    } catch (err) {
      reportError('pdf_tool_run', err, 'analyze_pdf');
    }
  };

  // A password-protected PDF is a precondition, not a failure: it is parked for Unlock instead of failing
  // later with generic copy (a small one would even come back untouched as "compressed"). Only
  // 'needs-password' is gated; an owner-password-only file compresses correctly. A newer pick wins.
  const checkEncryption = async (pdf: File) => {
    const run = encryptionCheck.begin();
    try {
      const bytes = await pdf.arrayBuffer();
      const protection = await probeEncryption(bytes);
      if (!run.isCurrent()) return;
      run.settle();
      if (protection !== 'needs-password') {
        compare.loadOriginal(pdf);
        openGate();
        return;
      }
      setNeedsUnlockBytes(bytes);
      setAnnouncement(t.protectedNeedsPasswordTitle);
    } catch (err) {
      console.error(err);
      if (!run.isCurrent()) return;
      run.settle();
      reportError('pdf_tool_run', err, 'check_encryption');
      compare.loadOriginal(pdf);
      openGate();
    }
  };

  // MERGE-14: a merged PDF handed off from /merge/ (saveHandoff + navigate)
  // is collected here on mount and dropped straight into the same path a
  // manual pick takes. This tool has no draft to race against, so mount is
  // enough - see useHandoffIntake.ts's own comment for why Sign/Redact
  // instead resolve their hand-off ahead of a draft restore.
  useHandoffIntake('compress', (file) => handleFilesAdded([file]));

  // The gate opens: the file may run, so the first build starts now. Not after the quiet wait - nothing
  // has changed yet that a person is still adjusting. usePreparedOutput registers a key while rendering, so
  // once the render that carries this file has run the build starts in this very tick; if the password
  // check beat that render, the effect below starts it right after, and never for the old file's key.
  const renderedFileRef = useRef<File | null>(null);
  renderedFileRef.current = file;
  const openGate = () => {
    machine.send({ type: 'gateOpened' });
    if (renderedFileRef.current === currentFileRef.current) prepareNow();
  };
  useEffect(() => {
    // Not after a failure: prepareNow would read that as Try again.
    if (machine.read().runnable && preparedStatus !== 'error') prepareNow();
  }, [runnable, fileSeq]);

  return { handleFilesAdded };
}

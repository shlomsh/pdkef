/**
 * The one open path for the page-grid tools (Split, Edit Pages, PDF to Image; ARCH-37).
 *
 * A pick reads the bytes, asks whether the file is protected (a protected PDF is a
 * precondition, not a failure: it lands in `needsUnlock` for src/shell/NeedsUnlock.tsx),
 * loads it through the tool's loader and tells the island the page count. A pick replaced
 * by a newer one is dropped wherever it is in that chain, so the older one resolving last
 * never wins. The island keeps what is its own (history, option state) in `onPick` and
 * `onLoaded`; both run from the latest render, so they may close over fresh state.
 */
import { useCallback, useRef, useState } from 'preact/hooks';
import { probeEncryption } from '../../lib/pdf/pdfEncryption.ts';
import { loadPdfWithPages } from '../../lib/pdf/loadPdfPages.ts';
import { reportError, type ErrorArea } from '../../lib/telemetry/errorReport.ts';
import { recordAction } from '../../lib/telemetry/actionTrail.ts';
import { formatMessage } from '../../lib/text/formatMessage';
import type { NeedsUnlockKind } from '../NeedsUnlock.tsx';

export interface LoadedPageDocument {
  pageCount: number;
  /** A repaired copy the grid and the export must read instead of the picked file. */
  workingFile?: File;
}

/** How a tool reads the page count of a PDF it has accepted, and the area its failures report under. */
export interface PageDocumentLoader {
  area: ErrorArea;
  run: (bytes: ArrayBuffer, file: File) => Promise<LoadedPageDocument>;
}

/** pdf-lib read with the page-tree repair: Split and Edit Pages, which export with pdf-lib. */
export const repairedPdfLoader: PageDocumentLoader = {
  area: 'pdf_tool_run',
  async run(bytes, file) {
    const loaded = await loadPdfWithPages(bytes);
    return {
      pageCount: loaded.pageCount,
      workingFile: loaded.repaired
        ? new File([loaded.bytes as BlobPart], file.name, { type: 'application/pdf', lastModified: file.lastModified })
        : undefined,
    };
  },
};

/** pdf.js alone, loaded on the first pick: PDF to Image renders and never writes with pdf-lib. */
export const thumbnailPdfLoader: PageDocumentLoader = {
  area: 'pdf_render',
  async run(_bytes, file) {
    const { openThumbnailSource } = await import('../../lib/pdf/thumbnails.js');
    const source = await openThumbnailSource(file);
    try {
      return { pageCount: source.pageCount };
    } finally {
      // expected: an abandoned document failing to release is nothing the person can act on
      await source.destroy().catch(() => {});
    }
  },
};

export interface OpenPageDocumentOptions {
  loader: PageDocumentLoader;
  /** Which kinds of protection stop the tool: PDF to Image renders an owner-restricted file as it is. */
  unlockKinds: readonly NeedsUnlockKind[];
  /** `loaded` is a template with {name} and {count}; `restricted` is only read when `unlockKinds` names it. */
  messages: { needsPassword: string; restricted?: string; loaded: string; loadFailed: string };
  announce: (text: string) => void;
  /** Synchronous, before any await: reset the island's own state for a new document. */
  onPick: (file: File) => void;
  onLoaded: (loaded: { pageCount: number; file: File }) => void;
}

export type OpenLoadStatus = 'idle' | 'loading-file' | 'error';
export interface NeedsUnlockState { kind: NeedsUnlockKind; bytes: ArrayBuffer }

export interface OpenPageDocument {
  file: File | null;
  /** The picked file, or its repaired copy once the load has finished. */
  workingFile: File | null;
  pageCount: number;
  /** Bumped on every pick: the prepared key's file identity, since two PDFs can share a name, size and date. */
  loadId: number;
  loadStatus: OpenLoadStatus;
  needsUnlock: NeedsUnlockState | null;
  open: (file: File) => Promise<void>;
}

export function useOpenPageDocument(options: OpenPageDocumentOptions): OpenPageDocument {
  const [file, setFile] = useState<File | null>(null);
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loadId, setLoadId] = useState(0);
  const [loadStatus, setLoadStatus] = useState<OpenLoadStatus>('idle');
  const [needsUnlock, setNeedsUnlock] = useState<NeedsUnlockState | null>(null);
  // The file picked last. A load that finishes after a newer pick is stale.
  const pickedRef = useRef<File | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const open = useCallback(async (selected: File) => {
    const { loader, unlockKinds, messages, announce, onPick, onLoaded } = optionsRef.current;
    recordAction(pickedRef.current ? 'replace_file' : 'add_files');
    pickedRef.current = selected;
    setFile(selected);
    setWorkingFile(selected);
    setLoadId((n) => n + 1);
    setLoadStatus('loading-file');
    setNeedsUnlock(null);
    setPageCount(0);
    onPick(selected);

    try {
      const bytes = await selected.arrayBuffer();
      let protection = 'open';
      try {
        protection = await probeEncryption(bytes);
      } catch (err) {
        // The probe itself failing says nothing about the file; load as today.
        reportError('pdf_tool_run', err, 'check_encryption');
      }
      if (pickedRef.current !== selected) return;
      if (protection === 'needs-password' || protection === 'owner-restricted') {
        if (unlockKinds.includes(protection)) {
          setNeedsUnlock({ kind: protection, bytes });
          setLoadStatus('idle');
          announce(protection === 'needs-password' ? messages.needsPassword : messages.restricted ?? messages.needsPassword);
          return;
        }
      }
      const loaded = await loader.run(bytes, selected);
      if (pickedRef.current !== selected) return;
      setWorkingFile(loaded.workingFile ?? selected);
      setPageCount(loaded.pageCount);
      setLoadStatus('idle');
      onLoaded({ pageCount: loaded.pageCount, file: selected });
      announce(formatMessage(messages.loaded, { name: selected.name, count: loaded.pageCount }));
    } catch (err) {
      reportError(optionsRef.current.loader.area, err, 'load_document');
      console.error(err);
      if (pickedRef.current !== selected) return;
      setLoadStatus('error');
      announce(messages.loadFailed);
    }
  }, []);

  return { file, workingFile, pageCount, loadId, loadStatus, needsUnlock, open };
}

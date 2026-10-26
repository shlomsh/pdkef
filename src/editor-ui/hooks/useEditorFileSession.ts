import { useEffect, useRef } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdf as loadEditorPdf, type PdfLoadController, type PdfLoadMessages } from '../../editor/workspace/loadPdf.ts';
import {
  useEditorDraftPersistence,
  type EditorDraftInitialState,
  type UseEditorDraftPersistenceOptions,
} from '../../editor/workspace/useEditorDraftPersistence.ts';
import { seedUniqueId } from '../../editor/model/ids.ts';
import type { HistoryElement } from '../../editor/model/actionHistory.ts';
import { cacheRecentFile } from '../../lib/drafts/draftStore.js';
import { isPdfFile } from '../../lib/fileKind.js';
import { recordAction } from '../../lib/actionTrail.ts';
import { useDocumentRetirement } from './useDocumentRetirement.ts';

/**
 * ARCH-37: the file session Sign and Redact share. One place owns how a PDF gets into an editor:
 * the picked-file guard, the load slot that makes a manual pick beat a slow draft restore, the
 * race-guarded pdf.js load, unique-id seeding, the recents entry, draft persistence, and the
 * installed app's "Open with" (File Handling API `launchQueue`).
 *
 * What stays with the tool is its own state: what a load resets (`initialize`), what it does with
 * the document (`onDocument`), how a coarse status reaches its store (`setLoadStatus`), and the
 * document's elements for the draft. Announcements default to English here; a tool that has
 * translated them passes `messages`.
 */

export type NeedsUnlockKind = 'needs-password' | 'owner-restricted';

export interface EditorSessionMessages {
  /** Nothing in the pick was a PDF. */
  invalidPdf: string;
  needsPassword: string;
  ownerRestricted: string;
  /** Timeout, failure, loaded and restored lines (see loadPdf.ts). */
  load?: PdfLoadMessages;
}

const englishSessionMessages: EditorSessionMessages = {
  invalidPdf: 'Choose a PDF file.',
  needsPassword: 'This PDF has a password. Unlock opens it.',
  ownerRestricted: 'This PDF is protected. Unlock takes the protection off.',
};

type DraftOptions<TElement extends HistoryElement> = Pick<
  UseEditorDraftPersistenceOptions<TElement>,
  'elements' | 'actionHistory' | 'carried' | 'details' | 'isDirty' | 'isElement'
>;

export interface EditorFileSessionOptions<TElement extends HistoryElement> {
  tool: 'sign' | 'redact';
  /** The open file, if any: a pick over an open file records `replace_file`. */
  file: File | null;
  /** The document the tool renders from, kept alive until its replacement has painted (RED-56). */
  pdfDocument: PDFDocumentProxy | null;
  /** The tool's own status string, which draft persistence reads. */
  status: string;
  setLoadStatus: (status: 'loading' | 'editing' | 'error') => void;
  setAnnouncement: (message: string) => void;
  /** A protected PDF: the tool shows its unlock state. The session announces it. */
  onNeedsUnlock: (kind: NeedsUnlockKind) => void;
  /** A new document is starting (fresh pick, restore or launch): reset the tool's state. */
  initialize: (document: { file: File; bytes: ArrayBuffer; preset: EditorDraftInitialState<TElement>; restored: boolean }) => void;
  /** pdf.js accepted the file. Resolve with page sizes etc.; the session adds it to recents after. */
  onDocument: (document: PDFDocumentProxy, isCurrent: () => boolean) => Promise<void> | void;
  draft: DraftOptions<TElement>;
  messages?: Partial<EditorSessionMessages>;
}

export function useEditorFileSession<TElement extends HistoryElement>(options: EditorFileSessionOptions<TElement>) {
  const { tool, file, pdfDocument, status, draft } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const retireDocument = useDocumentRetirement(pdfDocument);
  const loadIdRef = useRef(0);
  const loadControllerRef = useRef<PdfLoadController | null>(null);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins outright; the
  // other is skipped entirely. This closes the gap the loadId guard alone doesn't cover: a slow draft
  // restore that resolves *after* a fast manual pick has already finished editing would otherwise
  // still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  useEffect(() => () => {
    loadIdRef.current++;
    loadControllerRef.current?.cancel();
  }, []);

  const messages = { ...englishSessionMessages, ...options.messages };

  // Core loader shared by fresh picks, launches and draft restore. `bytes` is the source PDF;
  // `preset` seeds restored elements and history. Overlapping calls are ordered by loadPdf.ts: a
  // newer one retires the older, so a late draft restore can never overwrite a fresh pick.
  const loadPdf = async (
    selected: File,
    bytes: ArrayBuffer,
    preset: EditorDraftInitialState<TElement> = { elements: [], actionHistory: [] },
    restored = false,
  ) => {
    const live = optionsRef.current;
    const m = { ...englishSessionMessages, ...live.messages };
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, loadControllerRef, retireDocument, clearDraft,
      setStatus: live.setLoadStatus,
      setAnnouncement: live.setAnnouncement,
      messages: m.load,
      onNeedsUnlock: (kind) => {
        live.onNeedsUnlock(kind);
        live.setAnnouncement(kind === 'needs-password' ? m.needsPassword : m.ownerRestricted);
      },
      initialize: () => {
        live.initialize({ file: selected, bytes, preset, restored });
        seedUniqueId(preset.elements);
        fileBytesRef.current = bytes;
      },
      onDocument: async (doc, isCurrent) => {
        await live.onDocument(doc, isCurrent);
        if (!isCurrent()) return;
        // The cache holds source bytes only, never the editable state. Saving after pdf.js accepts
        // the file avoids advertising a corrupt PDF on the home page.
        void cacheRecentFile(tool, {
          fileName: selected.name,
          fileType: selected.type || 'application/pdf',
          fileBytes: bytes,
        });
      },
    });
  };

  // A manual pick and a File Handling API launch both already hold a real File. Claims the load
  // slot synchronously, before the first await, so it wins the mount-time draft-restore race.
  const loadFreshFile = async (selected: File) => {
    loadStartedRef.current = true;
    const replacing = optionsRef.current.file !== null;
    const bytes = await selected.arrayBuffer();
    recordAction(replacing ? 'replace_file' : 'add_files');
    await loadPdf(selected, bytes);
  };

  // No confirmation here: BasePdfTool asks before a replacement that would cost anything, so a file
  // reaching this handler has already been agreed to.
  const handleFilesAdded = async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => isPdfFile(f));
    if (pdfs.length === 0) {
      optionsRef.current.setAnnouncement(messages.invalidPdf);
      return;
    }
    await loadFreshFile(pdfs[0]);
  };

  const { clearDraft, isRestoring, draftSaveState } = useEditorDraftPersistence<TElement>({
    tool,
    file,
    fileBytes: fileBytesRef.current,
    elements: draft.elements,
    actionHistory: draft.actionHistory,
    carried: draft.carried,
    details: draft.details,
    status,
    isDirty: draft.isDirty,
    loadStartedRef,
    loadPdf,
    isElement: draft.isElement,
  });

  // File Handling API (manifest.webmanifest's file_handlers, DEMO-03): an installed PDkef launched
  // with a PDF, e.g. from a file manager's "Open with". Unlike Web Share Target, the browser hands the
  // file straight to this page's JS - no POST, no service worker, no handoff record - so it loads
  // exactly like a manual pick.
  const loadFreshFileRef = useRef(loadFreshFile);
  loadFreshFileRef.current = loadFreshFile;
  useEffect(() => {
    const launchQueue = (window as any).launchQueue;
    if (!launchQueue) return;
    launchQueue.setConsumer(async (launchParams: { files?: any[] }) => {
      if (loadStartedRef.current || !launchParams.files || launchParams.files.length === 0) return;
      try {
        const selected: File = await launchParams.files[0].getFile();
        await loadFreshFileRef.current(selected);
      } catch (error) {
        // expected: loadFreshFile has its own failure UI, the launch-queue file is external
        console.error(error);
      }
    });
  }, []);

  return {
    handleFilesAdded,
    loadPdf,
    /** The source PDF's bytes as last loaded: what draft autosave and export read. */
    fileBytesRef,
    loadStartedRef,
    loadIdRef,
    loadControllerRef,
    clearDraft,
    isRestoring,
    draftSaveState,
  };
}

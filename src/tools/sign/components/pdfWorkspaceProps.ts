import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { FormFieldRegions } from '../hooks/useFormFieldRegions.ts';
import type { FieldNavigation } from '../hooks/useFieldNavigation.ts';
import type { PendingSignaturePlacement } from '../hooks/useWorkspaceGestures.ts';
import type { SignStatus } from '../state/signState.ts';

/** PdfWorkspace's props, grouped by concern (ARCH-57): the document, the refs it measures, full
 * screen, history, the export actions, the hand-off row and the signature placement. */
export interface PdfWorkspaceProps {
  status: SignStatus;
  /** Overrides the default error copy below with a specific, nameable reason. */
  errorDetail?: string | null;
  /** Next/Previous across detected fields (MOBI-06); PdfSignTool.tsx builds the
   * real one so its own Tab shortcut and this toolbar's control share one
   * hasNext/hasPrevious and one goToNext/goToPrevious. */
  fieldNavigation?: FieldNavigation;
  /** LOC-09 stage 1: the toolbar row's own catalogue, passed straight through
   * from PdfSignTool.tsx to SignToolbar.tsx - see src/editor/registry/messages.ts's
   * SignMessages. Optional and English-default so PdfWorkspace.test.tsx (which
   * never passes it) is unaffected. Also supplies EditorPageHeader's lang/dir
   * (bidi-isolation wrapper, 5a1af03) for each rendered page. */
  messages?: Partial<SignMessages>;
  document: {
    numPages: number;
    pageSizes: PageGeometry[];
    /** Printed grids recovered from the page's own content (MOBI-03); empty until detected. */
    formRegions?: FormFieldRegions;
    pdfDocument: PDFDocumentProxy | null;
  };
  refs: {
    workspace: { current: HTMLDivElement | null };
    pageWrappers: { current: (HTMLDivElement | null)[] };
  };
  fullscreen: {
    isPseudo: boolean;
    active: boolean;
    toggle: () => void;
  };
  history: {
    log: HistoryLogger<EditorElement>;
    /** The tool's own single-step undo and redo, passed through to the toolbar.
     * They come from PdfSignTool rather than straight from the reducer because
     * each one also announces what it moved. `canRedo` is read from the context
     * below, beside `actionHistory`. */
    undo: () => void;
    redo: () => void;
  };
  output: {
    save: () => void;
    download: () => void;
    share: () => void;
    canShare?: boolean;
    shareReady?: boolean;
  };
  handoff?: {
    /** Whether a signed export of the document as it stands exists to carry on. */
    exportReady?: boolean;
    busy?: boolean;
    failed?: boolean;
    onHandoff?: (tool: string) => void;
  };
  signature: {
    hold: (placement: PendingSignaturePlacement) => void;
    showDialog: (open: boolean) => void;
    placeAt: (
      dataUrl: string,
      aspectRatio: number,
      pageIndex: number,
      leftPercent: number,
      topPercent: number,
    ) => void;
  };
  announce: (msg: string) => void;
}

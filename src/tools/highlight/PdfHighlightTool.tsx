import { useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import { FileActions } from '#shell/ToolShell.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import { useEditorFileSession } from '#editor-ui/hooks/useEditorFileSession.ts';
import { readBackAnnotations } from '#editor/comments/readBack.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { isEditorElement } from '#editor/registry/draftValidation.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useWorkspaceZoom } from './hooks/useWorkspaceZoom.ts';
import { useReadingLamp } from './hooks/useReadingLamp.ts';
import { useHighlightComments } from './hooks/useHighlightComments.ts';
import { useNoteRoom } from './hooks/useNoteRoom.ts';
import { useHighlightMarks } from './hooks/useHighlightMarks.ts';
import { useMarkerMemory } from './hooks/useMarker.ts';
import { useHistoryKeys } from './hooks/useHistoryKeys.ts';
import { useHighlightDownload } from './hooks/useHighlightDownload.ts';
import { describeFile } from '#lib/text/format.js';
import HighlightVerb from './verb/HighlightVerb.tsx';
import HighlightWorkspace from './components/HighlightWorkspace.tsx';
import { englishHighlightMessages as t } from './messages.ts';

type Status = 'idle' | 'loading' | 'editing' | 'error';

export default withIslandBoundary(function PdfHighlightTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [announcement, setAnnouncement] = useState('');
  const [needsUnlock, setNeedsUnlock] = useState<NeedsUnlockKind | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const { fullscreen, pseudoFullscreen, toggleLamp } = useReadingLamp(workspaceRef);
  const marks = useHighlightMarks();
  // R28: the first note makes room for the notes column in the event that opens its card, so the dispatches that
  // open and close cards go through here. Zoom and the comments view are created below and read when it runs.
  const room = useNoteRoom({ state: marks.state, dispatch: marks.dispatch, columnRef, zoom: () => zoom, isWide: () => comments.sheet === null });
  const comments = useHighlightComments({ state: marks.state, dispatch: room.dispatch, logAction: marks.logAction, announce: setAnnouncement });
  // A wheel is not a user gesture, so real fullscreen may be refused; the toggle then falls back to pseudo fullscreen.
  const zoom = useWorkspaceZoom({ pdfDocument, workspaceRef, columnRef, fullscreen, noted: comments.showRail, pageTurns: marks.pageTurns, onEnterLamp: toggleLamp });
  const markerMemory = useMarkerMemory({ marker: marks.marker, rearm: marks.rearm });
  const details = useMemo(() => ({ ...zoom.details, ...markerMemory.details }), [zoom.details, markerMemory.details]);
  const share = usePdfShare();
  // Undo and redo can bring the first note back or take the last one away, so they go through the room too.
  const undo = () => { if (!marks.canUndo) return; room.dispatch({ type: 'UNDO' }); recordAction('undo'); };
  const redo = () => { if (!marks.canRedo) return; room.dispatch({ type: 'REDO' }); recordAction('redo'); };
  useHistoryKeys({ enabled: status === 'editing', undo, redo });

  const session = useEditorFileSession<EditorElement>({
    tool: 'highlight-pdf',
    file,
    pdfDocument,
    status,
    setLoadStatus: setStatus,
    setAnnouncement,
    messages: { invalidPdf: t.invalidPdf, needsPassword: t.needsPassword, ownerRestricted: t.ownerRestricted },
    onNeedsUnlock: setNeedsUnlock,
    prepareFile: readBackAnnotations,
    initialize: ({ file: selected, preset }) => {
      setNeedsUnlock(null);
      marks.dispatch({ type: 'LOAD_DOCUMENT', payload: { elements: preset.elements, actionHistory: preset.actionHistory } });
      zoom.restore(preset.details);
      markerMemory.restore(preset.details);
      setFile(selected);
    },
    onDocument: (doc, isCurrent) => {
      if (isCurrent()) setPdfDocument(doc);
    },
    draft: {
      elements: marks.state.elements,
      actionHistory: marks.state.actionHistory,
      details,
      isDirty: marks.state.documentRevision !== (marks.state.draftBaselineRevision ?? marks.state.documentRevision) || zoom.touched || markerMemory.changed,
      isElement: isEditorElement,
    },
  });

  const handleDownload = useHighlightDownload({
    fileName: file?.name, bytes: () => session.fileBytesRef.current, elements: marks.state.elements, pageTurns: marks.pageTurns,
    save: (blob, name) => share.download(blob, name),
  });

  const numPages = pdfDocument?.numPages ?? 0;

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={session.handleFilesAdded}
      intake={{ multiple: false, accept: '.pdf,application/pdf' }}
      identity={{ file, label: file?.name, meta: describeFile(file, numPages, null) }}
      empty={{ art: <HighlightVerb />, message: t.emptyMessage }}
      draft={{ saveState: session.draftSaveState, checking: session.isRestoring }}
      analytics={{ tool: 'highlight-pdf' }}
      owns={{ shell: true }}
    >
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      {needsUnlock && (
        <NeedsUnlock kind={needsUnlock} file={file} bytes={session.fileBytesRef.current} from="highlight-pdf" toolName="Highlight PDF" verb="highlight" />
      )}

      {!needsUnlock && status === 'editing' && pdfDocument && (
        <HighlightWorkspace
          pdfDocument={pdfDocument} numPages={numPages} fileName={file?.name ?? ''} zoom={zoom}
          marks={marks} undo={undo} redo={redo} comments={comments} dispatch={room.dispatch} setAnnouncement={setAnnouncement} onDownload={handleDownload}
          workspaceRef={workspaceRef} columnRef={columnRef} fullscreen={fullscreen} pseudoFullscreen={pseudoFullscreen}
          onToggleFullscreen={toggleLamp}
        />
      )}

      {status === 'error' && !needsUnlock && (
        <ErrorMessage title={t.didntOpen} fullWidth>
          <LoadErrorBody />
        </ErrorMessage>
      )}
    </BasePdfTool>
  );
});

function LoadErrorBody() {
  return (
    <>
      {t.loadErrorLead} <a href="/unlock/">{t.loadErrorUnlock}</a> {t.loadErrorTail}
      <FileActions />
    </>
  );
}

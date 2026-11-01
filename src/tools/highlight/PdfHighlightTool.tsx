import { useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import { FileActions } from '#shell/ToolShell.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import { useEditorFileSession } from '#editor-ui/hooks/useEditorFileSession.ts';
import type { HistoryElement } from '#editor/model/actionHistory.ts';
import { describeFile } from '#lib/text/format.js';
import HighlightVerb from './verb/HighlightVerb.tsx';
import HighlightWorkspace from './components/HighlightWorkspace.tsx';
import { englishHighlightMessages as t } from './messages.ts';

const isNoElement = (_value: unknown): _value is HistoryElement => false;

type Status = 'idle' | 'loading' | 'editing' | 'error';

export default withIslandBoundary(function PdfHighlightTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [announcement, setAnnouncement] = useState('');
  const [needsUnlock, setNeedsUnlock] = useState<NeedsUnlockKind | null>(null);

  const session = useEditorFileSession<HistoryElement>({
    tool: 'highlight-pdf',
    file,
    pdfDocument,
    status,
    setLoadStatus: setStatus,
    setAnnouncement,
    messages: { invalidPdf: t.invalidPdf, needsPassword: t.needsPassword, ownerRestricted: t.ownerRestricted },
    onNeedsUnlock: setNeedsUnlock,
    initialize: ({ file: selected }) => {
      setNeedsUnlock(null);
      setFile(selected);
    },
    onDocument: (doc, isCurrent) => {
      if (isCurrent()) setPdfDocument(doc);
    },
    // Highlights join the draft in a later slice; for now nothing is ever dirty.
    draft: { elements: [], actionHistory: [], isDirty: false, isElement: isNoElement },
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
    >
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      {needsUnlock && (
        <NeedsUnlock kind={needsUnlock} file={file} bytes={session.fileBytesRef.current} from="highlight-pdf" toolName="Highlight PDF" verb="highlight" />
      )}

      {!needsUnlock && status === 'editing' && pdfDocument && (
        <HighlightWorkspace pdfDocument={pdfDocument} numPages={numPages} />
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

import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPageCanvas from '#editor-ui/PdfPageCanvas.tsx';
import EditorPageHeader from '#editor-ui/EditorPageHeader.tsx';
import workspaceStyles from '#editor-ui/Workspace.module.css';

/** The page column, read-only for now: each page as a card with its canvas, nothing laid over it. */
export default function HighlightWorkspace({ pdfDocument, numPages }: {
  pdfDocument: PDFDocumentProxy;
  numPages: number;
}) {
  return (
    <div className={workspaceStyles.workspace} data-workspace>
      <div className={workspaceStyles['pages-container']}>
        {Array.from({ length: numPages }).map((_, i) => (
          <div key={i} data-editor-page-card>
            <EditorPageHeader pageNumber={i + 1} onClear={null} />
            <div className={workspaceStyles['page-wrapper']} data-page-wrapper>
              <PdfPageCanvas pdfDocument={pdfDocument} pageNum={i + 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

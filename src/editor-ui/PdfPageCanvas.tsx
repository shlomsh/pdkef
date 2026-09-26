import { useRef, useEffect } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { PageGeometry } from '../editor/geometry/coords.ts';
import { getPdfRenderContext } from '../lib/pdfRender.js';
import workspaceStyles from './Workspace.module.css';

// Dedicated canvas rendering component for clean lifecycles and race-free layout paints
export default function PdfPageCanvas({
  pdfDocument,
  pageNum,
  pageGeometry,
  onViewportReady,
  renderScale = 1.5,
}: {
  pdfDocument: PDFDocumentProxy | null;
  pageNum: number;
  pageGeometry?: PageGeometry;
  /** Optional consumer signal emitted once this canvas has its final layout
   * dimensions. Redact uses it to release static content after a saved
   * multi-page workspace has stopped growing; callers that omit it retain the
   * existing rendering behavior. */
  onViewportReady?: (pageNum: number) => void;
  /** Optional pdf.js render scale. Defaults to 1.5 so Sign and Redact are
   * byte-for-byte unchanged when they don't pass it. SNG-16's fill-mode
   * camera passes zoom x devicePixelRatio, capped by the iOS canvas limit
   * (computed by its caller); CSS still sizes the canvas to 100% of the page
   * wrapper, so only sharpness changes, never layout. */
  renderScale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    let active = true;
    let renderTask: RenderTask | null = null;
    let page: PDFPageProxy | null = null;
    const renderPage = async () => {
      try {
        page = await pdfDocument.getPage(pageNum);
        // Rotation is supplied by the same PageGeometry used by the overlay
        // and export. CropBox is intrinsic to pdf.js's page.view, from which
        // that geometry was built, so the canvas and overlay share one frame.
        const viewport = page.getViewport({
          scale: renderScale,
          rotation: pageGeometry?.rotation ?? page.rotate,
        }); // sharp rendering
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        onViewportReady?.(pageNum);

        const context = getPdfRenderContext(canvas);
        if (!context || !active) return;
        renderTask = page.render({ canvasContext: context, canvas, viewport });
        await renderTask.promise;
      } catch (err) {
        // Cancellation is the normal teardown path when a document/page is
        // replaced or this canvas unmounts; only report real render failures.
        if (active && (!(err instanceof Error) || err.name !== 'RenderingCancelledException')) {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      }
    };

    renderPage();
    return () => {
      active = false;
      renderTask?.cancel?.();
      page?.cleanup?.();
    };
  }, [pdfDocument, pageNum, pageGeometry?.rotation, onViewportReady, renderScale]);

  return (
    <canvas
      ref={canvasRef}
      className={workspaceStyles['page-canvas']}
    />
  );
}

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
}: {
  pdfDocument: PDFDocumentProxy | null;
  pageNum: number;
  pageGeometry?: PageGeometry;
  /** Optional consumer signal emitted once this canvas has its final layout
   * dimensions. Redact uses it to release static content after a saved
   * multi-page workspace has stopped growing; callers that omit it retain the
   * existing rendering behavior. */
  onViewportReady?: (pageNum: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Set once the visible canvas has painted anything at all. A later render
  // (a fresh delete preview replacing the source document, most often) then
  // draws into an offscreen canvas and is only copied over on completion, so
  // the page never goes blank mid-rebuild. The very first paint skips this
  // and draws straight to the visible canvas, unchanged from before.
  const paintedRef = useRef(false);

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
          scale: 1.5,
          rotation: pageGeometry?.rotation ?? page.rotate,
        }); // sharp rendering
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        const isRepaint = paintedRef.current;
        const renderTarget = isRepaint ? document.createElement('canvas') : canvas;
        renderTarget.width = viewport.width;
        renderTarget.height = viewport.height;
        if (!isRepaint) onViewportReady?.(pageNum);

        const context = getPdfRenderContext(renderTarget);
        if (!context || !active) return;
        renderTask = page.render({ canvasContext: context, canvas: renderTarget, viewport });
        await renderTask.promise;
        if (!active) return;

        if (isRepaint) {
          canvas.width = renderTarget.width;
          canvas.height = renderTarget.height;
          const visibleContext = getPdfRenderContext(canvas);
          visibleContext?.drawImage(renderTarget, 0, 0);
          onViewportReady?.(pageNum);
        }
        paintedRef.current = true;
        // Lets anything laid over the page wait for the drawing it depends
        // on (Redact's delete lift waits for the page without the object).
        canvas.dispatchEvent(new CustomEvent('page-painted', { bubbles: true, detail: { pdfDocument } }));
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
  }, [pdfDocument, pageNum, pageGeometry?.rotation, onViewportReady]);

  return (
    <canvas
      ref={canvasRef}
      className={workspaceStyles['page-canvas']}
    />
  );
}

import { useRef, useEffect } from 'preact/hooks';
import type { PageGeometry } from '../editor/geometry/coords.ts';
import workspaceStyles from './SignTool/Workspace.module.css';

// Dedicated canvas rendering component for clean lifecycles and race-free layout paints
export default function PdfPageCanvas({
  pdfDocument,
  pageNum,
  pageGeometry,
}: {
  pdfDocument: any;
  pageNum: number;
  pageGeometry?: PageGeometry;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    let active = true;
    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(pageNum);
        // Rotation is supplied by the same PageGeometry used by the overlay
        // and export. CropBox is intrinsic to pdf.js's page.view, from which
        // that geometry was built, so the canvas and overlay share one frame.
        const viewport = page.getViewport({
          scale: 1.5,
          rotation: pageGeometry?.rotation ?? page.rotate,
        }); // sharp rendering
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (err) {
        console.error(`Error rendering page ${pageNum}:`, err);
      }
    };

    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDocument, pageNum, pageGeometry?.rotation]);

  return (
    <canvas
      ref={canvasRef}
      className={workspaceStyles['page-canvas']}
    />
  );
}

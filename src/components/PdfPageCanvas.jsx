import { useRef, useEffect } from 'preact/hooks';
import workspaceStyles from './SignTool/Workspace.module.css';

// Dedicated canvas rendering component for clean lifecycles and race-free layout paints
export default function PdfPageCanvas({ pdfDocument, pageNum }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    let active = true;
    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 }); // sharp rendering
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
  }, [pdfDocument, pageNum]);

  return (
    <canvas
      ref={canvasRef}
      className={workspaceStyles['page-canvas']}
    />
  );
}

import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from './sign.js';

/**
 * Applies redactions to a PDF by permanently flattening pages containing redaction marks.
 * Pages without redactions are copied losslessly.
 * 
 * @param {File} file - The original PDF file
 * @param {Array} elements - Array of redaction box objects { pageIndex, left, top, width, height } in percentages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>} The processed PDF blob
 */
export async function redactPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(bytes);
  const newDoc = await PDFDocument.create();
  
  // We need pdf.js to render pages to an image canvas for flattening
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdfjsDoc = await loadingTask.promise;

  for (let i = 0; i < sourceDoc.getPageCount(); i++) {
    const pageElements = elements.filter(el => el.pageIndex === i);
    
    if (pageElements.length === 0) {
      // No redactions on this page: copy losslessly
      const [copiedPage] = await newDoc.copyPages(sourceDoc, [i]);
      newDoc.addPage(copiedPage);
    } else {
      // Redactions present: render page to canvas, draw boxes, and save as flat image
      const pdfjsPage = await pdfjsDoc.getPage(i + 1);
      
      // Use scale = 2.5 to ensure the flattened image is crisp and readable
      const scale = 2.5; 
      const viewport = pdfjsPage.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      
      // Render the original PDF page to the canvas
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      await pdfjsPage.render(renderContext).promise;
      
      // If there are any blur elements, create a blurred copy of the entire canvas
      // This is much faster and cleaner than trying to blur individual sub-regions
      let blurredCanvas;
      if (pageElements.some(el => el.style === 'blur')) {
        blurredCanvas = document.createElement('canvas');
        blurredCanvas.width = canvas.width;
        blurredCanvas.height = canvas.height;
        const bCtx = blurredCanvas.getContext('2d');
        // 24px blur at 2.5x scale provides an extremely strong, unreadable blur
        bCtx.filter = 'blur(24px)';
        bCtx.drawImage(canvas, 0, 0);
      }
      
      // Draw redaction boxes
      for (const el of pageElements) {
        const x = (el.left / 100) * viewport.width;
        const y = (el.top / 100) * viewport.height;
        const w = (el.width / 100) * viewport.width;
        const h = (el.height / 100) * viewport.height;
        
        if (el.style === 'blur') {
          // Paste the blurred section over the original
          ctx.drawImage(blurredCanvas, x, y, w, h, x, y, w, h);
        } else {
          // Default to pure black blackout
          ctx.fillStyle = '#000000';
          ctx.fillRect(x, y, w, h);
        }
      }
      
      // Convert canvas to high-quality JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const base64Data = dataUrl.split(',')[1];
      const embeddedImage = await newDoc.embedJpg(base64Data);
      
      // Create a new blank page with the exact dimensions of the original
      const sourcePage = sourceDoc.getPage(i);
      const { width: pdfWidth, height: pdfHeight } = sourcePage.getSize();
      const newPage = newDoc.addPage([pdfWidth, pdfHeight]);
      
      // Paint the flattened image across the entire new page
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight
      });
    }
    
    onProgress?.((i + 1) / sourceDoc.getPageCount());
  }

  const redactedBytes = await newDoc.save();
  return new Blob([redactedBytes], { type: 'application/pdf' });
}

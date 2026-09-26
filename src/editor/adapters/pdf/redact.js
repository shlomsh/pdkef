import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from './pdfjsLoader.js';
import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { getElementDefinition } from '../../registry/index.ts';
import { resolveBlurStrength, blurRadius } from '../../model/blurStrength.ts';

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
  const loadingTask = pdfjs.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL });
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
      const ctx = getPdfRenderContext(canvas);
      
      // Render the original PDF page to the canvas
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      await pdfjsPage.render(renderContext).promise;
      
      // Each type owns the instruction it contributes to this destructive,
      // page-scoped flatten pass. The registry makes the type decision; this
      // module intentionally only owns PDF-wide canvas/raster orchestration.
      const instructions = pageElements.map((element) =>
        getElementDefinition(element.type).serialize(element, { redaction: true }),
      );

      // Each blur box pastes from a blurred copy of the entire page canvas at
      // its own strength, which is much faster and cleaner than blurring
      // individual sub-regions. Build one blurred canvas per distinct strength
      // present on this page, before any box is painted; the radius for each
      // strength comes from blurStrength.ts, which also resolves an absent or
      // unknown strength to 'strong' (today's 24px look).
      const blurredCanvases = new Map();
      const buildBlurredCanvas = (strength) => {
        const bCanvas = document.createElement('canvas');
        bCanvas.width = canvas.width;
        bCanvas.height = canvas.height;
        const bCtx = bCanvas.getContext('2d');
        bCtx.filter = `blur(${blurRadius(strength).exportPx}px)`;
        bCtx.drawImage(canvas, 0, 0);
        return bCanvas;
      };
      for (const instruction of instructions) {
        if (instruction?.kind !== 'blur') continue;
        const strength = resolveBlurStrength(instruction.element.strength);
        if (!blurredCanvases.has(strength)) {
          blurredCanvases.set(strength, buildBlurredCanvas(strength));
        }
      }

      // Draw the registry-provided redaction instructions.
      for (const instruction of instructions) {
        if (!instruction) continue;
        const { element } = instruction;
        const x = (element.left / 100) * viewport.width;
        const y = (element.top / 100) * viewport.height;
        const w = (element.width / 100) * viewport.width;
        const h = (element.height / 100) * viewport.height;
        
        if (instruction.kind === 'blur') {
          // Paste the blurred section over the original, at this box's own strength
          const strength = resolveBlurStrength(element.strength);
          ctx.drawImage(blurredCanvases.get(strength), x, y, w, h, x, y, w, h);
        } else {
          // Solid color redact box (defaults to black)
          ctx.fillStyle = element.color || '#000000';
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

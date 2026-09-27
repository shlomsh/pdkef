import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from './pdfjsLoader.js';
import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { getElementDefinition } from '../../registry/index.ts';
import { blurRadiusPx } from '../../model/blurStrength.ts';

/**
 * Builds a blurred copy of one box's source region, opaque even where the
 * blur reaches past the page edge.
 *
 * The radius depends on the box's own height (see blurStrength.ts), so each
 * box needs its own blurred canvas rather than one shared per-page blur. The
 * source rect is grown by a margin on every side because a blur needs
 * surrounding pixels to draw from; without the margin the box's edges would
 * blur toward nothing and look lighter than its center. The temp canvas is
 * filled opaque white before drawing so the pasted result is fully opaque
 * even at the page edge, where the grown source rect runs off the original
 * canvas and would otherwise leave semi-transparent pixels showing the
 * (unblurred) page underneath.
 */
function buildBoxBlur(original, x, y, w, h, radius) {
  const margin = Math.ceil(3 * radius);
  const sx = Math.max(0, x - margin);
  const sy = Math.max(0, y - margin);
  const sw = Math.min(original.width, x + w + margin) - sx;
  const sh = Math.min(original.height, y + h + margin) - sy;

  const temp = document.createElement('canvas');
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, sw, sh);
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(original, sx, sy, sw, sh, 0, 0, sw, sh);

  return { canvas: temp, sx, sy };
}

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

      // A blur box's radius is a fraction of its OWN height (blurStrength.ts),
      // so boxes can't share one page-wide blurred canvas. Snapshot the
      // original, unredacted page once, before any box is painted, so every
      // blur box keeps sourcing unredacted pixels the same way the old
      // shared canvas did.
      let original = null;
      if (instructions.some((instruction) => instruction?.kind === 'blur')) {
        original = document.createElement('canvas');
        original.width = canvas.width;
        original.height = canvas.height;
        original.getContext('2d').drawImage(canvas, 0, 0);
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
          // Paste the blurred section over the original, at a radius scaled
          // to this box's own height.
          const radius = blurRadiusPx(element.strength, h);
          const { canvas: blurred, sx, sy } = buildBoxBlur(original, x, y, w, h, radius);
          ctx.drawImage(blurred, x - sx, y - sy, w, h, x, y, w, h);
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

import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// Dynamic loader for PDFJS, shared across the Sign tool's page rendering and file loading.
let pdfjsLib;
export async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

let nextId = 0;
export function uniqueId() {
  return `el-${nextId++}`;
}

export function hexToRgbFractions(hex, fallback = '#000000') {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || fallback);
  const r = result ? parseInt(result[1], 16) / 255 : 0;
  const g = result ? parseInt(result[2], 16) / 255 : 0;
  const b = result ? parseInt(result[3], 16) / 255 : 0;
  return { r, g, b };
}

// Recolors a signature PNG's ink while preserving its alpha shape (drawn/typed
// signatures are opaque strokes on a transparent background).
export function tintImageDataUrl(dataUrl, hexColor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Bakes placed text/checkmark/signature elements into the PDF and returns the
// signed result as a Blob. Runs entirely in-memory in the browser - no network
// I/O except fetching bundled custom fonts from same-origin /fonts/.
export async function signPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  pdfDoc.registerFontkit(fontkit);

  const loadedFonts = {};
  const loadCustomFont = async (fontFamily, fontWeight, fontStyle) => {
    let styleStr = 'Regular';
    if (fontWeight === 'bold' && fontStyle === 'italic') styleStr = 'BoldItalic';
    else if (fontWeight === 'bold') styleStr = 'Bold';
    else if (fontStyle === 'italic') styleStr = 'Italic';
    const fileName = `${fontFamily}-${styleStr}.ttf`;

    if (loadedFonts[fileName]) return loadedFonts[fileName];

    try {
      const res = await fetch(`/fonts/${fileName}`);
      const fontBytes = await res.arrayBuffer();
      const customFont = await pdfDoc.embedFont(fontBytes);
      loadedFonts[fileName] = customFont;
      return customFont;
    } catch (e) {
      console.warn(`Could not load custom font ${fileName}`, e);
      return null;
    }
  };

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const page = pdfDoc.getPage(el.pageIndex);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Map screen percentages to PDF points
    const pdfX = (el.left / 100) * pdfWidth;
    const pdfY = pdfHeight - ((el.top / 100) * pdfHeight);

    if (el.type === 'text') {
      const fontSizeInPoints = el.fontSize || 12;
      const textValue = (el.text || '').trim();
      if (!textValue) continue;

      let resolvedFont = helveticaFont;
      if (el.fontFamily && ['Arimo', 'Heebo', 'Assistant'].includes(el.fontFamily)) {
        const customFont = await loadCustomFont(el.fontFamily, el.fontWeight, el.fontStyle);
        if (customFont) resolvedFont = customFont;
      } else {
        if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
        } else if (el.fontWeight === 'bold') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        } else if (el.fontStyle === 'italic') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        }
      }

      const { r, g, b } = hexToRgbFractions(el.color);

      // Helvetica baseline offset is roughly 85% of line height
      const baselineAdjustedY = pdfY - (fontSizeInPoints * 0.85);

      page.drawText(textValue, {
        x: pdfX,
        y: baselineAdjustedY,
        size: fontSizeInPoints,
        lineHeight: fontSizeInPoints * 1.2, // matches the editor's CSS line-height
        font: resolvedFont,
        color: rgb(r, g, b)
      });
    } else if (el.type === 'checkmark') {
      const elWidthPoints = (el.width / 100) * pdfWidth;
      const elHeightPoints = (el.height / 100) * pdfHeight;
      const { r: cr, g: cg, b: cb } = hexToRgbFractions(el.color, '#1463ff');

      if (el.mark === 'x') {
        // Draw vector X: corner-to-corner diagonals
        page.drawLine({
          start: { x: pdfX, y: pdfY },
          end: { x: pdfX + elWidthPoints, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
        page.drawLine({
          start: { x: pdfX + elWidthPoints, y: pdfY },
          end: { x: pdfX, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
      } else {
        // Draw vector checkmark
        // Start: Left edge, 40% height up from bottom
        page.drawLine({
          start: { x: pdfX, y: pdfY - elHeightPoints * 0.6 },
          end: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
        // End: Top-right edge
        page.drawLine({
          start: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
          end: { x: pdfX + elWidthPoints, y: pdfY },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
      }
    } else if (el.type === 'signature' && el.dataUrl) {
      const elWidthPoints = (el.width / 100) * pdfWidth;
      const elHeightPoints = (el.height / 100) * pdfHeight;
      const sourceDataUrl = el.color && el.color !== '#000000'
        ? await tintImageDataUrl(el.dataUrl, el.color)
        : el.dataUrl;
      const base64Data = sourceDataUrl.split(',')[1];
      const embeddedImage = await pdfDoc.embedPng(base64Data);

      page.drawImage(embeddedImage, {
        x: pdfX,
        y: pdfY - elHeightPoints, // origin at bottom-left of image box
        width: elWidthPoints,
        height: elHeightPoints
      });
    } else if (el.type === 'whiteout') {
      const elWidthPoints = (el.width / 100) * pdfWidth;
      const elHeightPoints = (el.height / 100) * pdfHeight;
      const { r, g, b } = hexToRgbFractions(el.color, '#ffffff');

      page.drawRectangle({
        x: pdfX,
        y: pdfY - elHeightPoints,
        width: elWidthPoints,
        height: elHeightPoints,
        color: rgb(r, g, b)
      });
    }

    onProgress?.((i + 1) / elements.length);
  }

  const signedBytes = await pdfDoc.save();
  return new Blob([signedBytes], { type: 'application/pdf' });
}
